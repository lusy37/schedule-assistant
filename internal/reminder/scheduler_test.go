package reminder

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"schedule-assistant/internal/domain"
	"schedule-assistant/internal/repository"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type recordingNotificationSender struct {
	items    []notifications.NotificationOptions
	attempts int
	err      error
}

func (sender *recordingNotificationSender) SendNotification(options notifications.NotificationOptions) error {
	sender.attempts++
	if sender.err != nil {
		return sender.err
	}
	sender.items = append(sender.items, options)
	return nil
}

func createReminderTestStore(t *testing.T) *repository.Store {
	t.Helper()
	store, err := repository.NewStore(filepath.Join(t.TempDir(), "reminders.db"), false)
	if err != nil {
		t.Fatalf("创建提醒测试数据库失败: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func saveReminderTestSchedule(t *testing.T, store *repository.Store, startAt, endAt time.Time, offsets []int) domain.Schedule {
	t.Helper()
	item, err := store.SaveSchedule(context.Background(), domain.ScheduleInput{
		Title:           "提醒测试",
		StartAt:         startAt.Format(time.RFC3339Nano),
		EndAt:           endAt.Format(time.RFC3339Nano),
		Colour:          "#3b82f6",
		ReminderOffsets: offsets,
	})
	if err != nil {
		t.Fatalf("保存提醒测试日程失败: %v", err)
	}
	return item
}

func TestReminderSchedulerCatchesUpUntilScheduleEnds(t *testing.T) {
	store := createReminderTestStore(t)
	sender := &recordingNotificationSender{}
	now := time.Date(2026, time.August, 28, 10, 0, 0, 0, time.UTC)
	item := saveReminderTestSchedule(t, store, now.Add(10*time.Minute), now.Add(70*time.Minute), []int{60})
	scheduler := New(store, sender)

	scheduler.scan(now)
	if len(sender.items) != 1 {
		t.Fatalf("错过超过 5 分钟但尚未结束的日程应补发提醒: count=%d", len(sender.items))
	}
	scheduler.scan(now.Add(time.Second))
	if len(sender.items) != 1 {
		t.Fatalf("已投递提醒不应重复发送: count=%d", len(sender.items))
	}

	triggerAt := time.Date(2026, time.August, 28, 9, 10, 0, 0, time.UTC)
	delivered, err := store.WasReminderDelivered(context.Background(), item.ID, 60, triggerAt)
	if err != nil || !delivered {
		t.Fatalf("补发提醒应记录投递状态: delivered=%v err=%v", delivered, err)
	}
}

func TestReminderSchedulerSkipsEndedAndFutureSchedules(t *testing.T) {
	store := createReminderTestStore(t)
	sender := &recordingNotificationSender{}
	now := time.Date(2026, time.August, 28, 10, 0, 0, 0, time.UTC)
	saveReminderTestSchedule(t, store, now.Add(-time.Hour), now.Add(-time.Minute), []int{15})
	saveReminderTestSchedule(t, store, now.Add(time.Hour), now.Add(2*time.Hour), []int{15})

	New(store, sender).scan(now)
	if len(sender.items) != 0 {
		t.Fatalf("已结束或尚未到触发时间的日程不应发送提醒: count=%d", len(sender.items))
	}
}

func TestReminderSchedulerRestartUATMergesAllOverdueReminders(t *testing.T) {
	store := createReminderTestStore(t)
	sender := &recordingNotificationSender{}
	startAt := time.Date(2026, time.August, 28, 10, 0, 0, 0, time.UTC)
	now := startAt.Add(-2 * time.Minute)
	item := saveReminderTestSchedule(t, store, startAt, startAt.Add(time.Hour), []int{60, 30, 5})
	scheduler := New(store, sender)

	scheduler.scan(now)
	if len(sender.items) != 1 {
		t.Fatalf("应用恢复时同一日程的多个过期提醒必须合并为一条: count=%d", len(sender.items))
	}
	if !strings.HasSuffix(sender.items[0].ID, "-5") {
		t.Fatalf("合并通知应使用最近一次过期提醒: id=%s", sender.items[0].ID)
	}
	if !strings.Contains(sender.items[0].Body, "已合并 3 个提醒") {
		t.Fatalf("合并通知应说明合并数量: body=%s", sender.items[0].Body)
	}
	for _, offset := range []int{60, 30, 5} {
		triggerAt := startAt.Add(-time.Duration(offset) * time.Minute)
		delivered, err := store.WasReminderDelivered(context.Background(), item.ID, offset, triggerAt)
		if err != nil || !delivered {
			t.Fatalf("被合并的提醒都应标记为已处理: offset=%d delivered=%v err=%v", offset, delivered, err)
		}
	}

	scheduler.scan(now.Add(time.Second))
	if len(sender.items) != 1 {
		t.Fatalf("下一轮扫描不应再次发送被合并的提醒: count=%d", len(sender.items))
	}
}

func TestReminderSchedulerKeepsFutureReminderAfterMerge(t *testing.T) {
	store := createReminderTestStore(t)
	sender := &recordingNotificationSender{}
	startAt := time.Date(2026, time.August, 28, 10, 0, 0, 0, time.UTC)
	item := saveReminderTestSchedule(t, store, startAt, startAt.Add(time.Hour), []int{60, 30, 5})
	scheduler := New(store, sender)

	scheduler.scan(startAt.Add(-10 * time.Minute))
	if len(sender.items) != 1 || !strings.HasSuffix(sender.items[0].ID, "-30") {
		t.Fatalf("09:50 应只合并已经过期的 60/30 分钟提醒: items=%#v", sender.items)
	}
	for _, offset := range []int{60, 30} {
		delivered, err := store.WasReminderDelivered(context.Background(), item.ID, offset, startAt.Add(-time.Duration(offset)*time.Minute))
		if err != nil || !delivered {
			t.Fatalf("过期提醒应标记为已处理: offset=%d delivered=%v err=%v", offset, delivered, err)
		}
	}
	futureDelivered, err := store.WasReminderDelivered(context.Background(), item.ID, 5, startAt.Add(-5*time.Minute))
	if err != nil || futureDelivered {
		t.Fatalf("未来提醒不应被提前标记: delivered=%v err=%v", futureDelivered, err)
	}

	scheduler.scan(startAt.Add(-5 * time.Minute))
	if len(sender.items) != 2 || !strings.HasSuffix(sender.items[1].ID, "-5") {
		t.Fatalf("未来提醒到点后应正常发送: items=%#v", sender.items)
	}
}

func TestReminderSchedulerRetriesWholeMergeAfterDeliveryFailure(t *testing.T) {
	store := createReminderTestStore(t)
	sender := &recordingNotificationSender{err: errors.New("模拟系统通知失败")}
	startAt := time.Date(2026, time.August, 28, 10, 0, 0, 0, time.UTC)
	item := saveReminderTestSchedule(t, store, startAt, startAt.Add(time.Hour), []int{60, 30, 5})
	scheduler := New(store, sender)

	scheduler.scan(startAt.Add(-2 * time.Minute))
	if sender.attempts != 1 || len(sender.items) != 0 {
		t.Fatalf("合并通知失败时本轮只能尝试一次: attempts=%d count=%d", sender.attempts, len(sender.items))
	}
	for _, offset := range []int{60, 30, 5} {
		delivered, err := store.WasReminderDelivered(context.Background(), item.ID, offset, startAt.Add(-time.Duration(offset)*time.Minute))
		if err != nil || delivered {
			t.Fatalf("发送失败时不应标记任何提醒: offset=%d delivered=%v err=%v", offset, delivered, err)
		}
	}

	sender.err = nil
	scheduler.scan(startAt.Add(-time.Minute))
	if sender.attempts != 2 || len(sender.items) != 1 {
		t.Fatalf("系统通知恢复后应重试为一条合并通知: attempts=%d count=%d", sender.attempts, len(sender.items))
	}
}
