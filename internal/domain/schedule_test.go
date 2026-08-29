package domain

import (
	"strings"
	"testing"
	"time"
)

func validInput() ScheduleInput {
	start := time.Date(2026, time.August, 28, 9, 0, 0, 0, time.Local)
	return ScheduleInput{
		Title:           "  设计评审  ",
		StartAt:         start.Format(time.RFC3339),
		EndAt:           start.Add(time.Hour).Format(time.RFC3339),
		Location:        " 会议室 A ",
		Colour:          "#10B981",
		ReminderOffsets: []int{60, 15, 15},
	}
}

func TestNormaliseAndValidate(t *testing.T) {
	result, err := validInput().NormaliseAndValidate()
	if err != nil {
		t.Fatalf("预期输入有效，实际返回错误: %v", err)
	}
	if result.Title != "设计评审" || result.Location != "会议室 A" {
		t.Fatalf("文本字段未正确清理: %#v", result)
	}
	if result.Colour != "#10b981" {
		t.Fatalf("颜色未正确标准化: %s", result.Colour)
	}
	if len(result.ReminderOffsets) != 2 || result.ReminderOffsets[0] != 15 || result.ReminderOffsets[1] != 60 {
		t.Fatalf("提醒偏移未正确排序去重: %#v", result.ReminderOffsets)
	}
	if result.Status != StatusPending {
		t.Fatalf("默认状态不正确: %s", result.Status)
	}
}

func TestNormaliseAndValidateRejectsInvalidRange(t *testing.T) {
	input := validInput()
	input.EndAt = input.StartAt
	if _, err := input.NormaliseAndValidate(); err == nil {
		t.Fatal("结束时间等于开始时间时应返回错误")
	}
}

func TestNormaliseAndValidateRejectsCrossDayRange(t *testing.T) {
	input := validInput()
	start := time.Date(2026, time.August, 28, 23, 30, 0, 0, time.Local)
	input.StartAt = start.Format(time.RFC3339)
	input.EndAt = start.Add(time.Hour).Format(time.RFC3339)
	if _, err := input.NormaliseAndValidate(); err == nil || !strings.Contains(err.Error(), "不能跨天") {
		t.Fatalf("跨天日程应返回明确错误，实际为: %v", err)
	}
}

func TestNormaliseAndValidateRejectsLargeReminder(t *testing.T) {
	input := validInput()
	input.ReminderOffsets = []int{31 * 24 * 60}
	if _, err := input.NormaliseAndValidate(); err == nil {
		t.Fatal("超过 30 天的提醒偏移应返回错误")
	}
}

func TestNormaliseAndValidateMatchesFrontendLimits(t *testing.T) {
	input := validInput()
	input.Title = strings.Repeat("日", 120)
	input.Location = strings.Repeat("地", 200)
	input.Notes = strings.Repeat("注", 4000)
	input.Colour = "#64748b"
	result, err := input.NormaliseAndValidate()
	if err != nil {
		t.Fatalf("前端允许的字段边界应能通过后端校验: %v", err)
	}
	if result.Colour != "#64748b" {
		t.Fatalf("前端颜色应被后端保留: %s", result.Colour)
	}

	input.Title += "日"
	if _, err := input.NormaliseAndValidate(); err == nil {
		t.Fatal("超过前端标题上限时应返回错误")
	}
}
