package cli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"schedule-assistant/internal/domain"
	"schedule-assistant/internal/repository"
)

const defaultColour = "#3b82f6"

type errorDetail struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Resolution string `json:"resolution"`
	Retryable  bool   `json:"retryable"`
}

type errorEnvelope struct {
	OK    bool        `json:"ok"`
	Error errorDetail `json:"error"`
}

type createEnvelope struct {
	OK       bool            `json:"ok"`
	Schedule domain.Schedule `json:"schedule"`
}

type listEnvelope struct {
	OK        bool              `json:"ok"`
	Count     int               `json:"count"`
	Schedules []domain.Schedule `json:"schedules"`
}

// IsInvocation 判断当前参数是否要求进入 CLI 模式。
func IsInvocation(args []string) bool {
	return len(args) > 0 && (args[0] == "schedule" || isHelp(args[0]))
}

// Run 执行面向 AI agent 的确定性命令，并返回进程退出码。
func Run(args []string, stdout, stderr io.Writer) int {
	if (len(args) == 1 && isHelp(args[0])) || (len(args) == 2 && args[0] == "schedule" && isHelp(args[1])) {
		fmt.Fprintln(stdout, rootHelp())
		return 0
	}
	if len(args) < 2 || args[0] != "schedule" {
		return writeError(stderr, "json", "INVALID_COMMAND", "缺少有效命令", "使用 schedule create 或 schedule list；执行 --help 查看示例", true)
	}

	switch args[1] {
	case "create":
		return runCreate(args[2:], stdout, stderr)
	case "list":
		return runList(args[2:], stdout, stderr)
	default:
		return writeError(stderr, "json", "INVALID_COMMAND", fmt.Sprintf("不支持命令 schedule %s", args[1]), "使用 schedule create 或 schedule list", true)
	}
}

func runCreate(args []string, stdout, stderr io.Writer) int {
	if containsHelp(args) {
		fmt.Fprintln(stdout, createHelp())
		return 0
	}
	flags := newFlagSet("schedule create")
	var title, date, start, end, location, notes, colour, reminders, output, database string
	flags.StringVar(&title, "title", "", "日程标题，必填")
	flags.StringVar(&date, "date", "", "日期，格式 YYYY-MM-DD，必填")
	flags.StringVar(&start, "start", "", "开始时间，格式 HH:mm，必填")
	flags.StringVar(&end, "end", "", "结束时间，格式 HH:mm，必填")
	flags.StringVar(&location, "location", "", "地点")
	flags.StringVar(&notes, "notes", "", "备注")
	flags.StringVar(&colour, "color", defaultColour, "颜色，格式 #RRGGBB")
	flags.StringVar(&reminders, "reminders", "15", "提醒分钟，逗号分隔；none 表示不提醒")
	flags.StringVar(&output, "output", "json", "输出格式：json 或 text")
	flags.StringVar(&database, "database", "", "SQLite 路径；默认使用桌面应用数据库")
	if err := flags.Parse(args); err != nil {
		return writeError(stderr, normaliseOutput(output), "INVALID_ARGUMENT", err.Error(), createUsage(), true)
	}
	output = normaliseOutput(output)
	if output == "" {
		return writeError(stderr, "json", "INVALID_OUTPUT", "output 必须是 json 或 text", "改用 --output json 或 --output text", true)
	}
	if flags.NArg() > 0 {
		return writeError(stderr, output, "INVALID_ARGUMENT", fmt.Sprintf("无法识别参数：%s", strings.Join(flags.Args(), " ")), createUsage(), true)
	}

	startAt, endAt, err := parseDateTimeRange(date, start, end)
	if err != nil {
		return writeError(stderr, output, "INVALID_DATETIME", err.Error(), "日期使用 YYYY-MM-DD，时间使用 24 小时制 HH:mm，例如 --date 2026-08-30 --start 09:00 --end 10:00", true)
	}
	offsets, err := parseReminders(reminders)
	if err != nil {
		return writeError(stderr, output, "INVALID_REMINDERS", err.Error(), "使用逗号分隔的非负整数分钟，例如 --reminders 5,15,30；不提醒使用 none", true)
	}

	input := domain.ScheduleInput{
		Title:           title,
		StartAt:         startAt.Format(time.RFC3339),
		EndAt:           endAt.Format(time.RFC3339),
		Location:        location,
		Notes:           notes,
		Colour:          colour,
		ReminderOffsets: offsets,
	}
	if _, err := input.NormaliseAndValidate(); err != nil {
		return writeError(stderr, output, "VALIDATION_ERROR", err.Error(), "修正字段后使用相同命令重试；日程必须同日且位于 08:00 至 21:00", true)
	}

	store, err := openStore(database)
	if err != nil {
		return writeError(stderr, output, "STORAGE_ERROR", err.Error(), "确认当前用户配置目录或 --database 指定路径可写后重试", true)
	}
	defer store.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	item, err := store.SaveSchedule(ctx, input)
	if err != nil {
		return writeError(stderr, output, "CREATE_FAILED", err.Error(), "检查输入和数据库写入权限后重试", true)
	}
	if output == "text" {
		fmt.Fprintf(stdout, "已创建日程 %s：%s %s-%s\n", item.ID, item.Title, startAt.Format("2006-01-02 15:04"), endAt.Format("15:04"))
		return 0
	}
	writeJSON(stdout, createEnvelope{OK: true, Schedule: item})
	return 0
}

func runList(args []string, stdout, stderr io.Writer) int {
	if containsHelp(args) {
		fmt.Fprintln(stdout, listHelp())
		return 0
	}
	flags := newFlagSet("schedule list")
	var date, status, output, database string
	flags.StringVar(&date, "date", "", "筛选日期，格式 YYYY-MM-DD；省略则查询全部")
	flags.StringVar(&status, "status", "all", "状态：all、pending、completed 或 cancelled")
	flags.StringVar(&output, "output", "json", "输出格式：json 或 text")
	flags.StringVar(&database, "database", "", "SQLite 路径；默认使用桌面应用数据库")
	if err := flags.Parse(args); err != nil {
		return writeError(stderr, normaliseOutput(output), "INVALID_ARGUMENT", err.Error(), listUsage(), true)
	}
	output = normaliseOutput(output)
	if output == "" {
		return writeError(stderr, "json", "INVALID_OUTPUT", "output 必须是 json 或 text", "改用 --output json 或 --output text", true)
	}
	if flags.NArg() > 0 {
		return writeError(stderr, output, "INVALID_ARGUMENT", fmt.Sprintf("无法识别参数：%s", strings.Join(flags.Args(), " ")), listUsage(), true)
	}
	if status != "all" && status != domain.StatusPending && status != domain.StatusCompleted && status != domain.StatusCancelled {
		return writeError(stderr, output, "INVALID_STATUS", fmt.Sprintf("不支持状态 %q", status), "使用 all、pending、completed 或 cancelled", true)
	}
	var selectedDate time.Time
	var err error
	if date != "" {
		selectedDate, err = time.ParseInLocation("2006-01-02", date, time.Local)
		if err != nil {
			return writeError(stderr, output, "INVALID_DATE", fmt.Sprintf("日期 %q 格式无效", date), "使用 YYYY-MM-DD，例如 2026-08-30", true)
		}
	}

	store, err := openStore(database)
	if err != nil {
		return writeError(stderr, output, "STORAGE_ERROR", err.Error(), "确认当前用户配置目录或 --database 指定路径可读后重试", true)
	}
	defer store.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	items, err := store.ListSchedules(ctx)
	if err != nil {
		return writeError(stderr, output, "LIST_FAILED", err.Error(), "检查数据库路径和读取权限后重试", true)
	}
	filtered := make([]domain.Schedule, 0, len(items))
	for _, item := range items {
		if status != "all" && item.Status != status {
			continue
		}
		if date != "" && !scheduleStartsOn(item, selectedDate) {
			continue
		}
		filtered = append(filtered, item)
	}

	if output == "text" {
		for _, item := range filtered {
			startAt, _ := time.Parse(time.RFC3339Nano, item.StartAt)
			endAt, _ := time.Parse(time.RFC3339Nano, item.EndAt)
			fmt.Fprintf(stdout, "%s\t%s\t%s-%s\t%s\n", item.ID, startAt.Local().Format("2006-01-02 15:04"), endAt.Local().Format("15:04"), item.Status, item.Title)
		}
		return 0
	}
	writeJSON(stdout, listEnvelope{OK: true, Count: len(filtered), Schedules: filtered})
	return 0
}

func newFlagSet(name string) *flag.FlagSet {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Usage = func() {}
	return flags
}

func parseDateTimeRange(date, start, end string) (time.Time, time.Time, error) {
	if date == "" || start == "" || end == "" {
		return time.Time{}, time.Time{}, errors.New("date、start 和 end 均为必填参数")
	}
	day, err := time.ParseInLocation("2006-01-02", date, time.Local)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("日期 %q 格式无效", date)
	}
	startClock, err := time.Parse("15:04", start)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("开始时间 %q 格式无效", start)
	}
	endClock, err := time.Parse("15:04", end)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("结束时间 %q 格式无效", end)
	}
	startAt := time.Date(day.Year(), day.Month(), day.Day(), startClock.Hour(), startClock.Minute(), 0, 0, time.Local)
	endAt := time.Date(day.Year(), day.Month(), day.Day(), endClock.Hour(), endClock.Minute(), 0, 0, time.Local)
	return startAt, endAt, nil
}

func parseReminders(value string) ([]int, error) {
	value = strings.TrimSpace(value)
	if value == "" || strings.EqualFold(value, "none") {
		return []int{}, nil
	}
	offsets := make([]int, 0)
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		offset, err := strconv.Atoi(part)
		if err != nil || offset < 0 || offset > 30*24*60 {
			return nil, fmt.Errorf("提醒分钟 %q 无效", part)
		}
		offsets = append(offsets, offset)
	}
	return offsets, nil
}

func openStore(path string) (*repository.Store, error) {
	if strings.TrimSpace(path) == "" {
		var err error
		path, err = repository.DefaultDatabasePath()
		if err != nil {
			return nil, err
		}
	}
	return repository.NewStore(path)
}

func scheduleStartsOn(item domain.Schedule, day time.Time) bool {
	startAt, err := time.Parse(time.RFC3339Nano, item.StartAt)
	if err != nil {
		return false
	}
	local := startAt.Local()
	year, month, date := local.Date()
	return year == day.Year() && month == day.Month() && date == day.Day()
}

func normaliseOutput(output string) string {
	output = strings.ToLower(strings.TrimSpace(output))
	if output == "json" || output == "text" {
		return output
	}
	return ""
}

func writeError(writer io.Writer, output, code, message, resolution string, retryable bool) int {
	if output == "text" {
		fmt.Fprintf(writer, "错误 [%s]：%s。%s\n", code, message, resolution)
	} else {
		writeJSON(writer, errorEnvelope{OK: false, Error: errorDetail{
			Code: code, Message: message, Resolution: resolution, Retryable: retryable,
		}})
	}
	return 2
}

func writeJSON(writer io.Writer, value any) {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}

func createUsage() string {
	return "示例：schedule create --title 设计评审 --date 2026-08-30 --start 09:00 --end 10:00 --reminders 15,30"
}

func listUsage() string {
	return "示例：schedule list --date 2026-08-30 --status pending"
}

func isHelp(value string) bool {
	return value == "help" || value == "--help" || value == "-h"
}

func containsHelp(args []string) bool {
	for _, arg := range args {
		if isHelp(arg) {
			return true
		}
	}
	return false
}

func rootHelp() string {
	return "日程助手 AI CLI\n\n命令：\n  schedule create  创建日程\n  schedule list    查询日程\n\n执行 schedule create --help 或 schedule list --help 查看参数。"
}

func createHelp() string {
	return "创建日程：\n  schedule create --title <标题> --date <YYYY-MM-DD> --start <HH:mm> --end <HH:mm> [--reminders <5,15,30|none>] [--location <地点>] [--notes <备注>] [--color <#RRGGBB>] [--output <json|text>]"
}

func listHelp() string {
	return "查询日程：\n  schedule list [--date <YYYY-MM-DD>] [--status <all|pending|completed|cancelled>] [--output <json|text>]"
}
