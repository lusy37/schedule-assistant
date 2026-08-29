package cli

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestCreateAndListScheduleForAgent(t *testing.T) {
	database := filepath.Join(t.TempDir(), "agent-cli.db")
	var stdout, stderr bytes.Buffer
	exitCode := Run([]string{
		"schedule", "create",
		"--title", "AI 创建的设计评审",
		"--date", "2026-08-30",
		"--start", "09:00",
		"--end", "10:00",
		"--location", "在线会议",
		"--reminders", "30,15,15",
		"--database", database,
	}, &stdout, &stderr)
	if exitCode != 0 {
		t.Fatalf("创建命令失败: code=%d stderr=%s", exitCode, stderr.String())
	}
	var created createEnvelope
	if err := json.Unmarshal(stdout.Bytes(), &created); err != nil {
		t.Fatalf("创建命令未返回稳定 JSON: %v output=%s", err, stdout.String())
	}
	if !created.OK || created.Schedule.ID == "" || created.Schedule.Title != "AI 创建的设计评审" {
		t.Fatalf("创建结果不正确: %#v", created)
	}
	if len(created.Schedule.ReminderOffsets) != 2 || created.Schedule.ReminderOffsets[0] != 15 || created.Schedule.ReminderOffsets[1] != 30 {
		t.Fatalf("提醒应排序去重: %#v", created.Schedule.ReminderOffsets)
	}

	stdout.Reset()
	stderr.Reset()
	exitCode = Run([]string{
		"schedule", "list",
		"--date", "2026-08-30",
		"--status", "pending",
		"--database", database,
	}, &stdout, &stderr)
	if exitCode != 0 {
		t.Fatalf("查询命令失败: code=%d stderr=%s", exitCode, stderr.String())
	}
	var listed listEnvelope
	if err := json.Unmarshal(stdout.Bytes(), &listed); err != nil {
		t.Fatalf("查询命令未返回稳定 JSON: %v output=%s", err, stdout.String())
	}
	if !listed.OK || listed.Count != 1 || listed.Schedules[0].ID != created.Schedule.ID {
		t.Fatalf("查询结果不正确: %#v", listed)
	}
}

func TestCreateReturnsActionableValidationErrors(t *testing.T) {
	for _, testCase := range []struct {
		name string
		args []string
		code string
	}{
		{
			name: "日期格式错误",
			args: []string{"schedule", "create", "--title", "测试", "--date", "明天", "--start", "09:00", "--end", "10:00"},
			code: "INVALID_DATETIME",
		},
		{
			name: "提醒格式错误",
			args: []string{"schedule", "create", "--title", "测试", "--date", "2026-08-30", "--start", "09:00", "--end", "10:00", "--reminders", "十五"},
			code: "INVALID_REMINDERS",
		},
		{
			name: "时间超出日历范围",
			args: []string{"schedule", "create", "--title", "测试", "--date", "2026-08-30", "--start", "07:30", "--end", "09:00"},
			code: "VALIDATION_ERROR",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			exitCode := Run(testCase.args, &stdout, &stderr)
			if exitCode == 0 {
				t.Fatal("无效参数不应成功")
			}
			var response errorEnvelope
			if err := json.Unmarshal(stderr.Bytes(), &response); err != nil {
				t.Fatalf("错误响应必须是 JSON: %v output=%s", err, stderr.String())
			}
			if response.OK || response.Error.Code != testCase.code || response.Error.Resolution == "" {
				t.Fatalf("错误响应不可恢复: %#v", response)
			}
		})
	}
}

func TestListRejectsUnknownStatus(t *testing.T) {
	var stdout, stderr bytes.Buffer
	exitCode := Run([]string{"schedule", "list", "--status", "done"}, &stdout, &stderr)
	if exitCode == 0 || !bytes.Contains(stderr.Bytes(), []byte("INVALID_STATUS")) {
		t.Fatalf("未知状态应返回明确错误: code=%d stderr=%s", exitCode, stderr.String())
	}
}

func TestHelpDocumentsAgentCommands(t *testing.T) {
	for _, args := range [][]string{{"--help"}, {"schedule", "--help"}, {"schedule", "create", "--help"}, {"schedule", "list", "--help"}} {
		var stdout, stderr bytes.Buffer
		if exitCode := Run(args, &stdout, &stderr); exitCode != 0 || stdout.Len() == 0 || stderr.Len() != 0 {
			t.Fatalf("帮助命令应成功且只写标准输出: args=%v code=%d stdout=%s stderr=%s", args, exitCode, stdout.String(), stderr.String())
		}
	}
}

func TestIsInvocationOnlyMatchesCLICommands(t *testing.T) {
	if !IsInvocation([]string{"schedule", "list"}) || !IsInvocation([]string{"--help"}) {
		t.Fatal("schedule 和帮助参数应进入 CLI 模式")
	}
	if IsInvocation(nil) || IsInvocation([]string{"--hidden"}) {
		t.Fatal("普通 GUI 参数不应进入 CLI 模式")
	}
}
