package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"schedule-assistant/internal/domain"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type reminderStore interface {
	ListSchedules(context.Context) ([]domain.Schedule, error)
	WasReminderDelivered(context.Context, string, int, time.Time) (bool, error)
	MarkRemindersDelivered(context.Context, string, map[int]time.Time) error
}

type notificationSender interface {
	SendNotification(notifications.NotificationOptions) error
}

type dueReminder struct {
	offset    int
	triggerAt time.Time
}

type ReminderScheduler struct {
	store         reminderStore
	notifications notificationSender
	wake          chan struct{}
	stop          chan struct{}
	stopOnce      sync.Once
}

func NewReminderScheduler(store reminderStore, notificationService notificationSender) *ReminderScheduler {
	return &ReminderScheduler{
		store:         store,
		notifications: notificationService,
		wake:          make(chan struct{}, 1),
		stop:          make(chan struct{}),
	}
}

func (scheduler *ReminderScheduler) Start() {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		scheduler.scan(time.Now())
		for {
			select {
			case <-ticker.C:
				scheduler.scan(time.Now())
			case <-scheduler.wake:
				scheduler.scan(time.Now())
			case <-scheduler.stop:
				return
			}
		}
	}()
}

func (scheduler *ReminderScheduler) Wake() {
	select {
	case scheduler.wake <- struct{}{}:
	default:
	}
}

func (scheduler *ReminderScheduler) Stop() {
	scheduler.stopOnce.Do(func() {
		close(scheduler.stop)
	})
}

func (scheduler *ReminderScheduler) scan(now time.Time) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	schedules, err := scheduler.store.ListSchedules(ctx)
	if err != nil {
		log.Printf("扫描提醒失败: %v", err)
		return
	}
	for _, item := range schedules {
		if item.Status != domain.StatusPending {
			continue
		}
		startAt, err := time.Parse(time.RFC3339Nano, item.StartAt)
		if err != nil {
			log.Printf("跳过时间格式无效的日程 %s: %v", item.ID, err)
			continue
		}
		endAt, err := time.Parse(time.RFC3339Nano, item.EndAt)
		if err != nil {
			log.Printf("跳过结束时间格式无效的日程 %s: %v", item.ID, err)
			continue
		}
		if !now.Before(endAt) {
			continue
		}
		due := make([]dueReminder, 0, len(item.ReminderOffsets))
		failedToReadDelivery := false
		for _, offset := range item.ReminderOffsets {
			triggerAt := startAt.Add(-time.Duration(offset) * time.Minute)
			if now.Before(triggerAt) {
				continue
			}
			delivered, err := scheduler.store.WasReminderDelivered(ctx, item.ID, offset, triggerAt)
			if err != nil {
				log.Printf("读取提醒发送状态失败: %v", err)
				failedToReadDelivery = true
				break
			}
			if delivered {
				continue
			}
			due = append(due, dueReminder{offset: offset, triggerAt: triggerAt})
		}
		if failedToReadDelivery || len(due) == 0 {
			continue
		}

		latest := due[0]
		for _, candidate := range due[1:] {
			if candidate.triggerAt.After(latest.triggerAt) {
				latest = candidate
			}
		}
		if err := scheduler.deliver(item, latest.offset, startAt, len(due)); err != nil {
			log.Printf("发送提醒失败: %v", err)
			continue
		}

		deliveries := make(map[int]time.Time, len(due))
		for _, reminder := range due {
			deliveries[reminder.offset] = reminder.triggerAt
		}
		if err := scheduler.store.MarkRemindersDelivered(ctx, item.ID, deliveries); err != nil {
			log.Printf("记录合并提醒状态失败: %v", err)
		}
	}
}

func (scheduler *ReminderScheduler) deliver(item domain.Schedule, offset int, startAt time.Time, mergedCount int) error {
	body := fmt.Sprintf("%s 开始", startAt.Local().Format("15:04"))
	if item.Location != "" {
		body += " · " + item.Location
	}
	if mergedCount > 1 {
		body += fmt.Sprintf(" · 已合并 %d 个提醒", mergedCount)
	}
	return scheduler.notifications.SendNotification(notifications.NotificationOptions{
		ID:    fmt.Sprintf("schedule-%s-%d", item.ID, offset),
		Title: "日程提醒：" + item.Title,
		Body:  body,
		Data: map[string]interface{}{
			"scheduleId": item.ID,
		},
		ThreadID:          "schedule-assistant",
		InterruptionLevel: notifications.InterruptionLevelActive,
	})
}
