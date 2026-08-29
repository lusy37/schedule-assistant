package main

import (
	"context"
	"errors"
	"fmt"

	"schedule-assistant/internal/domain"
	"schedule-assistant/internal/repository"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type RuntimeState struct {
	AutostartEnabled bool   `json:"autostartEnabled"`
	DatabasePath     string `json:"databasePath"`
}

// ScheduleService 是唯一暴露给前端的业务服务。
type ScheduleService struct {
	store         *repository.Store
	databasePath  string
	notifications *notifications.NotificationService
	scheduler     *ReminderScheduler
	app           *application.App
	window        *application.WebviewWindow
}

func NewScheduleService(store *repository.Store, databasePath string, notificationService *notifications.NotificationService) *ScheduleService {
	return &ScheduleService{
		store:         store,
		databasePath:  databasePath,
		notifications: notificationService,
		scheduler:     NewReminderScheduler(store, notificationService),
	}
}

//wails:ignore
func (service *ScheduleService) BindApplication(app *application.App, window *application.WebviewWindow) {
	service.app = app
	service.window = window
}

// ServiceStartup 在通知服务就绪后启动提醒扫描。
//
//wails:ignore
func (service *ScheduleService) ServiceStartup(_ context.Context, _ application.ServiceOptions) error {
	service.scheduler.Start()
	return nil
}

// ServiceShutdown 负责停止后台任务并关闭数据库。
//
//wails:ignore
func (service *ScheduleService) ServiceShutdown() error {
	service.scheduler.Stop()
	return service.store.Close()
}

func (service *ScheduleService) ListSchedules() ([]domain.Schedule, error) {
	return service.store.ListSchedules(context.Background())
}

func (service *ScheduleService) SaveSchedule(input domain.ScheduleInput) (domain.Schedule, error) {
	item, err := service.store.SaveSchedule(context.Background(), input)
	if err != nil {
		return domain.Schedule{}, err
	}
	service.scheduler.Wake()
	service.emit("schedule:changed", item.ID)
	return item, nil
}

func (service *ScheduleService) DeleteSchedule(id string) error {
	if id == "" {
		return errors.New("日程 ID 不能为空")
	}
	if err := service.store.DeleteSchedule(context.Background(), id); err != nil {
		return err
	}
	service.emit("schedule:changed", id)
	return nil
}

func (service *ScheduleService) SetScheduleCompleted(id string, completed bool) (domain.Schedule, error) {
	item, err := service.store.SetScheduleCompleted(context.Background(), id, completed)
	if err != nil {
		return domain.Schedule{}, err
	}
	service.scheduler.Wake()
	service.emit("schedule:changed", item.ID)
	return item, nil
}

func (service *ScheduleService) RuntimeState() (RuntimeState, error) {
	state := RuntimeState{DatabasePath: service.databasePath}
	if service.app == nil {
		return state, nil
	}
	enabled, err := service.app.Autostart.IsEnabled()
	if err != nil && !errors.Is(err, application.ErrAutostartNotSupported) {
		return state, fmt.Errorf("读取开机启动状态失败: %w", err)
	}
	state.AutostartEnabled = enabled
	return state, nil
}

func (service *ScheduleService) SetAutostart(enabled bool) error {
	if service.app == nil {
		return errors.New("桌面应用尚未初始化")
	}
	if enabled {
		return service.app.Autostart.EnableWithOptions(application.AutostartOptions{
			Identifier: "schedule-assistant",
			Arguments:  []string{"--hidden"},
		})
	}
	return service.app.Autostart.Disable()
}

func (service *ScheduleService) SendTestNotification() error {
	return service.notifications.SendNotification(notifications.NotificationOptions{
		ID:       "schedule-assistant-test",
		Title:    "日程助手通知测试",
		Body:     "系统通知工作正常。",
		ThreadID: "schedule-assistant",
	})
}

func (service *ScheduleService) MinimiseWindow() {
	if service.window != nil {
		service.window.Minimise()
	}
}

func (service *ScheduleService) ToggleMaximiseWindow() {
	if service.window != nil {
		service.window.ToggleMaximise()
	}
}

func (service *ScheduleService) HideWindow() {
	if service.window != nil {
		service.window.Hide()
	}
}

//wails:ignore
func (service *ScheduleService) ShowWindow() {
	if service.window != nil {
		service.window.Show().Focus()
	}
}

//wails:ignore
func (service *ScheduleService) WakeScheduler() {
	service.scheduler.Wake()
}

func (service *ScheduleService) emit(name, payload string) {
	if service.app != nil {
		service.app.Event.Emit(name, payload)
	}
}
