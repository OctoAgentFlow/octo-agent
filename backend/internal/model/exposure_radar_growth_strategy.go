package model

type ExposureRadarGrowthStrategy struct {
	Base
	UserID              uint   `gorm:"index;not null;uniqueIndex:ux_exposure_radar_growth_strategy;comment:所属用户ID" json:"user_id"`
	BotID               uint   `gorm:"index;not null;default:0;uniqueIndex:ux_exposure_radar_growth_strategy;comment:关联OAF Bot ID" json:"bot_id"`
	XAccountID          uint   `gorm:"index;column:x_account_id;not null;default:0;uniqueIndex:ux_exposure_radar_growth_strategy;comment:关联X账号ID" json:"x_account_id"`
	Region              string `gorm:"size:16;index;not null;default:en;uniqueIndex:ux_exposure_radar_growth_strategy;comment:策略区域" json:"region"`
	TargetAudience      string `gorm:"size:512;comment:目标受众" json:"target_audience"`
	PrimaryGoal         string `gorm:"size:128;comment:增长目标" json:"primary_goal"`
	CoreTopicsJSON      string `gorm:"type:text;comment:核心话题JSON" json:"core_topics_json"`
	AvoidTopicsJSON     string `gorm:"type:text;comment:避开话题JSON" json:"avoid_topics_json"`
	CompetitorsJSON     string `gorm:"type:text;comment:竞品或参考账号JSON" json:"competitors_json"`
	ReplyStyle          string `gorm:"size:64;comment:回复风格" json:"reply_style"`
	DailyMoveLimit      int    `gorm:"not null;default:10;comment:每日人工处理上限" json:"daily_move_limit"`
	SafetyMode          string `gorm:"size:32;not null;default:balanced;comment:安全模式" json:"safety_mode"`
	OperatorNotes       string `gorm:"size:512;comment:运营备注" json:"operator_notes"`
	LastReviewedSummary string `gorm:"size:512;comment:最近策略复盘摘要" json:"last_reviewed_summary"`
}
