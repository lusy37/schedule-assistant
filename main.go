package main

import (
	"embed"
	"log"
	"os"
	"slices"

	"schedule-assistant/internal/cli"
	"schedule-assistant/internal/repository"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func init() {
	application.RegisterEvent[string]("schedule:changed")
	application.RegisterEvent[string]("schedule:open")
	application.RegisterEvent[string]("schedule:create")
}

func main() {
	if cli.IsInvocation(os.Args[1:]) {
		os.Exit(cli.Run(os.Args[1:], os.Stdout, os.Stderr))
	}

	databasePath, err := repository.DefaultDatabasePath()
	if err != nil {
		log.Fatal(err)
	}
	store, err := repository.NewStore(databasePath, true)
	if err != nil {
		log.Fatal(err)
	}

	notificationService := notifications.New()
	scheduleService := NewScheduleService(store, databasePath, notificationService)
	var mainWindow *application.WebviewWindow

	app := application.New(application.Options{
		Name:        "日程助手",
		Description: "本地优先的日程待办提醒软件",
		Services: []application.Service{
			application.NewService(notificationService),
			application.NewService(scheduleService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.local.scheduleassistant",
			OnSecondInstanceLaunch: func(_ application.SecondInstanceData) {
				if mainWindow != nil {
					mainWindow.Show().Focus()
				}
			},
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	mainWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "日程助手",
		Width:            1200,
		Height:           800,
		MinWidth:         960,
		MinHeight:        640,
		Frameless:        true,
		Hidden:           slices.Contains(os.Args, "--hidden"),
		URL:              "/",
		BackgroundColour: application.NewRGB(248, 250, 252),
		Windows: application.WindowsWindow{
			Theme:                  application.Light,
			NonClientRegionSupport: true,
		},
	})
	scheduleService.BindApplication(app, mainWindow)

	mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		mainWindow.Hide()
		event.Cancel()
	})

	trayMenu := app.NewMenu()
	trayMenu.Add("打开日程助手").OnClick(func(_ *application.Context) {
		scheduleService.ShowWindow()
	})
	trayMenu.Add("新建日程").OnClick(func(_ *application.Context) {
		scheduleService.ShowWindow()
		app.Event.Emit("schedule:create", "")
	})
	trayMenu.AddSeparator()
	trayMenu.Add("退出").OnClick(func(_ *application.Context) {
		app.Quit()
	})

	systemTray := app.SystemTray.New()
	systemTray.SetIcon(appIcon)
	systemTray.SetTooltip("日程助手")
	systemTray.SetMenu(trayMenu)
	systemTray.OnClick(scheduleService.ShowWindow)

	notificationService.OnNotificationResponse(func(result notifications.NotificationResult) {
		if result.Error != nil {
			log.Printf("处理通知响应失败: %v", result.Error)
			return
		}
		scheduleService.ShowWindow()
		if scheduleID, ok := result.Response.UserInfo["scheduleId"].(string); ok {
			app.Event.Emit("schedule:open", scheduleID)
		}
	})

	app.Event.OnApplicationEvent(events.Common.SystemDidWake, func(_ *application.ApplicationEvent) {
		scheduleService.WakeScheduler()
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
