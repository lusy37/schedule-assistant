package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"schedule-assistant/internal/domain"

	_ "modernc.org/sqlite"
)

// Store 封装 SQLite 访问，保证前端无法直接操作本地数据库。
type Store struct {
	db *sql.DB
}

func DefaultDatabasePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("获取用户配置目录失败: %w", err)
	}
	dir := filepath.Join(configDir, "ScheduleAssistant")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建数据目录失败: %w", err)
	}
	return filepath.Join(dir, "schedule-assistant.db"), nil
}

func NewStore(path string, seedDemo bool) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	db.SetMaxOpenConns(1)

	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	if seedDemo {
		if err := store.seedDemoSchedules(context.Background(), time.Now()); err != nil {
			_ = db.Close()
			return nil, err
		}
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA foreign_keys = ON`,
		`PRAGMA busy_timeout = 5000`,
		`CREATE TABLE IF NOT EXISTS schedules (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			start_at TEXT NOT NULL,
			end_at TEXT NOT NULL,
			location TEXT NOT NULL DEFAULT '',
			notes TEXT NOT NULL DEFAULT '',
			colour TEXT NOT NULL,
			reminder_offsets TEXT NOT NULL DEFAULT '[]',
			status TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_schedules_start_at ON schedules(start_at)`,
		`CREATE TABLE IF NOT EXISTS reminder_deliveries (
			schedule_id TEXT NOT NULL,
			offset_minutes INTEGER NOT NULL,
			trigger_at TEXT NOT NULL,
			delivered_at TEXT NOT NULL,
			PRIMARY KEY (schedule_id, offset_minutes, trigger_at),
			FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
		)`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("初始化数据库失败: %w", err)
		}
	}
	return nil
}

func (s *Store) ListSchedules(ctx context.Context) ([]domain.Schedule, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, start_at, end_at, location, notes, colour,
		       reminder_offsets, status, created_at, updated_at
		FROM schedules
		ORDER BY start_at, end_at, title`)
	if err != nil {
		return nil, fmt.Errorf("读取日程失败: %w", err)
	}
	defer rows.Close()

	result := make([]domain.Schedule, 0)
	for rows.Next() {
		item, err := scanSchedule(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历日程失败: %w", err)
	}
	return result, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanSchedule(row rowScanner) (domain.Schedule, error) {
	var item domain.Schedule
	var offsetsJSON string
	if err := row.Scan(
		&item.ID,
		&item.Title,
		&item.StartAt,
		&item.EndAt,
		&item.Location,
		&item.Notes,
		&item.Colour,
		&offsetsJSON,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return item, fmt.Errorf("解析日程失败: %w", err)
	}
	if err := json.Unmarshal([]byte(offsetsJSON), &item.ReminderOffsets); err != nil {
		return item, fmt.Errorf("解析提醒设置失败: %w", err)
	}
	if item.ReminderOffsets == nil {
		item.ReminderOffsets = []int{}
	}
	return item, nil
}

func (s *Store) GetSchedule(ctx context.Context, id string) (domain.Schedule, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, title, start_at, end_at, location, notes, colour,
		       reminder_offsets, status, created_at, updated_at
		FROM schedules WHERE id = ?`, id)
	item, err := scanSchedule(row)
	if errors.Is(err, sql.ErrNoRows) {
		return item, errors.New("日程不存在")
	}
	return item, err
}

func (s *Store) SaveSchedule(ctx context.Context, raw domain.ScheduleInput) (domain.Schedule, error) {
	input, err := raw.NormaliseAndValidate()
	if err != nil {
		return domain.Schedule{}, err
	}
	if input.ID == "" {
		input.ID, err = newID()
		if err != nil {
			return domain.Schedule{}, err
		}
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	createdAt := now
	var existingCreatedAt string
	err = s.db.QueryRowContext(ctx, `SELECT created_at FROM schedules WHERE id = ?`, input.ID).Scan(&existingCreatedAt)
	if err == nil {
		createdAt = existingCreatedAt
	} else if !errors.Is(err, sql.ErrNoRows) {
		return domain.Schedule{}, fmt.Errorf("检查日程失败: %w", err)
	}

	offsetsJSON, err := json.Marshal(input.ReminderOffsets)
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("序列化提醒设置失败: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("开启保存事务失败: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO schedules (
			id, title, start_at, end_at, location, notes, colour,
			reminder_offsets, status, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			start_at = excluded.start_at,
			end_at = excluded.end_at,
			location = excluded.location,
			notes = excluded.notes,
			colour = excluded.colour,
			reminder_offsets = excluded.reminder_offsets,
			status = excluded.status,
			updated_at = excluded.updated_at`,
		input.ID,
		input.Title,
		input.StartAt,
		input.EndAt,
		input.Location,
		input.Notes,
		input.Colour,
		string(offsetsJSON),
		input.Status,
		createdAt,
		now,
	)
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("保存日程失败: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM reminder_deliveries WHERE schedule_id = ?`, input.ID); err != nil {
		return domain.Schedule{}, fmt.Errorf("重置提醒状态失败: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.Schedule{}, fmt.Errorf("提交日程失败: %w", err)
	}
	return s.GetSchedule(ctx, input.ID)
}

func (s *Store) DeleteSchedule(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM schedules WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除日程失败: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("确认删除结果失败: %w", err)
	}
	if affected == 0 {
		return errors.New("日程不存在")
	}
	return nil
}

func (s *Store) SetScheduleCompleted(ctx context.Context, id string, completed bool) (domain.Schedule, error) {
	status := domain.StatusPending
	if completed {
		status = domain.StatusCompleted
	}
	result, err := s.db.ExecContext(ctx, `UPDATE schedules SET status = ?, updated_at = ? WHERE id = ?`, status, time.Now().UTC().Format(time.RFC3339Nano), id)
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("更新完成状态失败: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return domain.Schedule{}, fmt.Errorf("确认状态更新失败: %w", err)
	}
	if affected == 0 {
		return domain.Schedule{}, errors.New("日程不存在")
	}
	return s.GetSchedule(ctx, id)
}

func (s *Store) WasReminderDelivered(ctx context.Context, scheduleID string, offsetMinutes int, triggerAt time.Time) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM reminder_deliveries
		WHERE schedule_id = ? AND offset_minutes = ? AND trigger_at = ?`,
		scheduleID,
		offsetMinutes,
		triggerAt.UTC().Format(time.RFC3339Nano),
	).Scan(&count)
	return count > 0, err
}

func (s *Store) MarkReminderDelivered(ctx context.Context, scheduleID string, offsetMinutes int, triggerAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO reminder_deliveries (
			schedule_id, offset_minutes, trigger_at, delivered_at
		) VALUES (?, ?, ?, ?)`,
		scheduleID,
		offsetMinutes,
		triggerAt.UTC().Format(time.RFC3339Nano),
		time.Now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return fmt.Errorf("记录提醒发送状态失败: %w", err)
	}
	return nil
}

func (s *Store) seedDemoSchedules(ctx context.Context, base time.Time) error {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schedules`).Scan(&count); err != nil {
		return fmt.Errorf("检查初始数据失败: %w", err)
	}
	if count > 0 {
		return nil
	}

	day := time.Date(base.Year(), base.Month(), base.Day(), 0, 0, 0, 0, base.Location())
	seeds := []struct {
		title    string
		start    string
		end      string
		location string
		colour   string
	}{
		{"每周跨部门例会", "09:00", "10:00", "会议室 A", "#3b82f6"},
		{"设计稿评审", "11:30", "12:00", "在线会议", "#10b981"},
		{"产品路线图规划会议", "14:00", "15:30", "会议室 B", "#f59e0b"},
		{"同步下周预算", "16:30", "17:00", "办公室", "#8b5cf6"},
	}
	for _, seed := range seeds {
		startAt, err := time.ParseInLocation("2006-01-02 15:04", day.Format("2006-01-02")+" "+seed.start, base.Location())
		if err != nil {
			return err
		}
		endAt, err := time.ParseInLocation("2006-01-02 15:04", day.Format("2006-01-02")+" "+seed.end, base.Location())
		if err != nil {
			return err
		}
		_, err = s.SaveSchedule(ctx, domain.ScheduleInput{
			Title:           seed.title,
			StartAt:         startAt.Format(time.RFC3339),
			EndAt:           endAt.Format(time.RFC3339),
			Location:        seed.location,
			Colour:          seed.colour,
			ReminderOffsets: []int{15},
		})
		if err != nil {
			return fmt.Errorf("写入示例日程失败: %w", err)
		}
	}
	return nil
}

func newID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("生成日程 ID 失败: %w", err)
	}
	buffer[6] = (buffer[6] & 0x0f) | 0x40
	buffer[8] = (buffer[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(buffer)
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:32], nil
}
