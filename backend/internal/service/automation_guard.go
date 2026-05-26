package service

import (
	"errors"
	"fmt"
	"time"

	"octo-agent/backend/internal/model"
	"octo-agent/backend/internal/repository"
)

var ErrAutomationModulePaused = errors.New("automation module is paused")

func assertAutomationModuleEnabled(repo *repository.AutomationRepository, userID uint, typ string) error {
	if repo == nil {
		return nil
	}
	if err := repo.EnsureDefaults(userID); err != nil {
		return err
	}
	cfg, err := repo.GetByUserAndType(userID, typ)
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		return fmt.Errorf("%w: %s", ErrAutomationModulePaused, typ)
	}
	return nil
}

func assertAutomationModuleEnabledForAction(repo *repository.AutomationRepository, activityRepo *repository.ActivityRepository, userID uint, typ string, action string) error {
	err := assertAutomationModuleEnabled(repo, userID, typ)
	if errors.Is(err, ErrAutomationModulePaused) {
		_ = recordAutomationActivity(activityRepo, userID, typ, "failed", "activity.preview.automationModulePausedBlocked", action)
	}
	return err
}

func recordAutomationActivity(repo *repository.ActivityRepository, userID uint, typ string, status string, previewKey string, message string) error {
	if repo == nil || repo.DB == nil {
		return nil
	}
	now := time.Now().UTC()
	return repo.DB.Create(&model.ActivityLog{
		UserID:        userID,
		Type:          typ,
		Status:        status,
		PreviewKey:    previewKey,
		AccountHandle: "System",
		ExecutedAt:    now,
		ErrorMessage:  truncateErrMsg(message),
	}).Error
}
