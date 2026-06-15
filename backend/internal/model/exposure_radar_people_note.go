package model

import "time"

type ExposureRadarPeopleNote struct {
	Base
	UserID            uint       `gorm:"index;not null;uniqueIndex:ux_exposure_radar_people_note;comment:所属用户ID" json:"user_id"`
	Region            string     `gorm:"size:16;index;not null;default:all;uniqueIndex:ux_exposure_radar_people_note;comment:区域" json:"region"`
	AuthorHandle      string     `gorm:"size:128;index;not null;uniqueIndex:ux_exposure_radar_people_note;comment:X作者handle" json:"author_handle"`
	AuthorName        string     `gorm:"size:255;comment:X作者显示名" json:"author_name"`
	Stage             string     `gorm:"size:32;index;comment:运营阶段" json:"stage"`
	TagsJSON          string     `gorm:"type:text;comment:标签JSON" json:"tags_json"`
	Notes             string     `gorm:"size:512;comment:运营备注" json:"notes"`
	LastSignalID      string     `gorm:"size:160;index;comment:最近信号ID" json:"last_signal_id"`
	LastInteractionAt *time.Time `gorm:"index;comment:最近人工互动时间" json:"last_interaction_at,omitempty"`
}
