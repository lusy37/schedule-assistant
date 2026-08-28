package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"schedule-assistant/internal/domain"
	"schedule-assistant/internal/repository"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type ReminderScheduler struct {
	store         *repository.Store
	notifications *notifications.NotificationService
	wake          chan struct{}
	stop          chan struct{}
	stopOnce      sync.Once
}

func NewReminderScheduler(store *repository.Store, notificationService *notifications.NotificationService) *ReminderScheduler {
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
		for _, offset := range item.ReminderOffsets {
			triggerAt := startAt.Add(-time.Duration(offset) * time.Minute)
			lateness := now.Sub(triggerAt)
			if lateness < 0 || lateness > 5*time.Minute {
				continue
			}
			delivered, err := scheduler.store.WasReminderDelivered(ctx, item.ID, offset, triggerAt)
			if err != nil {
				log.Printf("读取提醒发送状态失败: %v", err)
				continue
			}
			if delivered {
				continue
			}
			if err := scheduler.deliver(item, offset, startAt); err != nil {
				log.Printf("发送提醒失败: %v", err)
				continue
			}
			if err := scheduler.store.MarkReminderDelivered(ctx, item.ID, offset, triggerAt); err != nil {
				log.Printf("记录提醒状态失败: %v", err)
			}
		}
	}
}

func (scheduler *ReminderScheduler) deliver(item domain.Schedule, offset int, startAt time.Time) error {
	body := fmt.Sprintf("%s 开始", startAt.Local().Format("15:04"))
	if item.Location != "" {
		body += " · " + item.Location
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
