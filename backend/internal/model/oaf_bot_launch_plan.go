package model

import "time"

type OAFBotLaunchPlan struct {
	Base
	PublicToken       string     `gorm:"size:64;uniqueIndex;not null;comment:公开承接token" json:"public_token"`
	UserID            uint       `gorm:"index;comment:转换后的用户ID，0表示匿名" json:"user_id,omitempty"`
	Stage             string     `gorm:"size:48;index;not null;comment:起号阶段" json:"stage"`
	AccountType       string     `gorm:"size:64;index;comment:账号类型" json:"account_type,omitempty"`
	XHandle           string     `gorm:"size:128;comment:X账号handle，可选" json:"x_handle,omitempty"`
	InputJSON         string     `gorm:"type:longtext;not null;comment:匿名起号计划输入JSON" json:"input_json,omitempty"`
	OutputJSON        string     `gorm:"type:longtext;not null;comment:生成的起号计划JSON" json:"output_json,omitempty"`
	ConvertedOAFBotID uint       `gorm:"index;comment:转换创建的OAF Bot ID" json:"converted_oaf_bot_id,omitempty"`
	ConvertedAt       *time.Time `gorm:"comment:转换时间" json:"converted_at,omitempty"`
}
