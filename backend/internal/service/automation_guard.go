package service

import (
	"errors"
	"fmt"

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
