package repository

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"schedule-assistant/internal/domain"
)

func TestStoreScheduleLifecycle(t *testing.T) {
	store, err := NewStore(filepath.Join(t.TempDir(), "test.db"), false)
	if err != nil {
		t.Fatalf("创建测试数据库失败: %v", err)
	}
	defer store.Close()

	start := time.Date(2026, time.August, 28, 9, 0, 0, 0, time.Local)
	created, err := store.SaveSchedule(context.Background(), domain.ScheduleInput{
		Title:           "产品例会",
		StartAt:         start.Format(time.RFC3339),
		EndAt:           start.Add(time.Hour).Format(time.RFC3339),
		Location:        "会议室 A",
		Colour:          "#3b82f6",
		ReminderOffsets: []int{15, 60},
	})
	if err != nil {
		t.Fatalf("保存日程失败: %v", err)
	}
	if created.ID == "" {
		t.Fatal("保存后应生成日程 ID")
	}

	items, err := store.ListSchedules(context.Background())
	if err != nil || len(items) != 1 {
		t.Fatalf("读取日程失败: len=%d err=%v", len(items), err)
	}

	completed, err := store.SetScheduleCompleted(context.Background(), created.ID, true)
	if err != nil {
		t.Fatalf("更新完成状态失败: %v", err)
	}
	if completed.Status != domain.StatusCompleted {
		t.Fatalf("完成状态未保存: %s", completed.Status)
	}

	triggerAt := start.Add(-15 * time.Minute)
	if err := store.MarkReminderDelivered(context.Background(), created.ID, 15, triggerAt); err != nil {
		t.Fatalf("记录提醒状态失败: %v", err)
	}
	delivered, err := store.WasReminderDelivered(context.Background(), created.ID, 15, triggerAt)
	if err != nil || !delivered {
		t.Fatalf("提醒去重状态读取失败: delivered=%v err=%v", delivered, err)
	}

	updated, err := store.SaveSchedule(context.Background(), domain.ScheduleInput{
		ID:              created.ID,
		Title:           "产品例会（已更新）",
		StartAt:         created.StartAt,
		EndAt:           created.EndAt,
		Location:        created.Location,
		Notes:           created.Notes,
		Colour:          created.Colour,
		ReminderOffsets: created.ReminderOffsets,
		Status:          completed.Status,
	})
	if err != nil || updated.Title != "产品例会（已更新）" {
		t.Fatalf("更新日程失败: item=%#v err=%v", updated, err)
	}
	delivered, err = store.WasReminderDelivered(context.Background(), created.ID, 15, triggerAt)
	if err != nil || !delivered {
		t.Fatalf("无关字段更新后不应清除提醒投递记录: delivered=%v err=%v", delivered, err)
	}

	if err := store.DeleteSchedule(context.Background(), created.ID); err != nil {
		t.Fatalf("删除日程失败: %v", err)
	}
	items, err = store.ListSchedules(context.Background())
	if err != nil || len(items) != 0 {
		t.Fatalf("删除后仍有日程: len=%d err=%v", len(items), err)
	}
}
