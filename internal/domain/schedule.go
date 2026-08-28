package domain

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	StatusPending   = "pending"
	StatusCompleted = "completed"
	StatusCancelled = "cancelled"
)

var allowedColours = map[string]struct{}{
	"#3b82f6": {},
	"#10b981": {},
	"#f59e0b": {},
	"#8b5cf6": {},
	"#ef4444": {},
	"#06b6d4": {},
}

// Schedule 是前端与 Go 服务之间共享的日程实体。
type Schedule struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	StartAt         string `json:"startAt"`
	EndAt           string `json:"endAt"`
	Location        string `json:"location,omitempty"`
	Notes           string `json:"notes,omitempty"`
	Colour          string `json:"color"`
	ReminderOffsets []int  `json:"reminderOffsets"`
	Status          string `json:"status"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

// ScheduleInput 表示新增或更新日程时允许前端提交的字段。
type ScheduleInput struct {
	ID              string `json:"id,omitempty"`
	Title           string `json:"title"`
	StartAt         string `json:"startAt"`
	EndAt           string `json:"endAt"`
	Location        string `json:"location,omitempty"`
	Notes           string `json:"notes,omitempty"`
	Colour          string `json:"color"`
	ReminderOffsets []int  `json:"reminderOffsets"`
	Status          string `json:"status,omitempty"`
}

// NormaliseAndValidate 会清理输入并返回可安全持久化的数据。
func (input ScheduleInput) NormaliseAndValidate() (ScheduleInput, error) {
	input.ID = strings.TrimSpace(input.ID)
	input.Title = strings.TrimSpace(input.Title)
	input.Location = strings.TrimSpace(input.Location)
	input.Notes = strings.TrimSpace(input.Notes)
	input.Colour = strings.ToLower(strings.TrimSpace(input.Colour))
	input.Status = strings.TrimSpace(input.Status)

	if input.Title == "" {
		return input, errors.New("日程名称不能为空")
	}
	if len([]rune(input.Title)) > 80 {
		return input, errors.New("日程名称不能超过 80 个字符")
	}
	if len([]rune(input.Location)) > 120 {
		return input, errors.New("地点不能超过 120 个字符")
	}
	if len([]rune(input.Notes)) > 1000 {
		return input, errors.New("备注不能超过 1000 个字符")
	}

	startAt, err := time.Parse(time.RFC3339Nano, input.StartAt)
	if err != nil {
		return input, fmt.Errorf("开始时间格式无效: %w", err)
	}
	endAt, err := time.Parse(time.RFC3339Nano, input.EndAt)
	if err != nil {
		return input, fmt.Errorf("结束时间格式无效: %w", err)
	}
	if !endAt.After(startAt) {
		return input, errors.New("结束时间必须晚于开始时间")
	}
	if endAt.Sub(startAt) > 31*24*time.Hour {
		return input, errors.New("单个日程不能超过 31 天")
	}

	if _, ok := allowedColours[input.Colour]; !ok {
		input.Colour = "#3b82f6"
	}
	if input.Status == "" {
		input.Status = StatusPending
	}
	if input.Status != StatusPending && input.Status != StatusCompleted && input.Status != StatusCancelled {
		return input, errors.New("日程状态无效")
	}

	seen := make(map[int]struct{}, len(input.ReminderOffsets))
	offsets := make([]int, 0, len(input.ReminderOffsets))
	for _, offset := range input.ReminderOffsets {
		if offset < 0 || offset > 30*24*60 {
			return input, errors.New("提醒时间必须在日程开始前 30 天以内")
		}
		if _, ok := seen[offset]; ok {
			continue
		}
		seen[offset] = struct{}{}
		offsets = append(offsets, offset)
	}
	sort.Ints(offsets)
	input.ReminderOffsets = offsets
	return input, nil
}
