package model

type TrendOperationRule struct {
	Base
	TrendName      string `gorm:"size:255;not null;comment:趋势原始名称" json:"trend_name"`
	NormalizedName string `gorm:"size:255;not null;uniqueIndex:idx_trend_operation_rule;comment:归一化趋势名称" json:"normalized_name"`
	Category       string `gorm:"size:32;index;comment:趋势分类" json:"category"`
	RuleType       string `gorm:"size:48;not null;uniqueIndex:idx_trend_operation_rule;index;comment:运营规则类型" json:"rule_type"`
	Reason         string `gorm:"size:512;comment:规则原因" json:"reason"`
	Source         string `gorm:"size:48;index;comment:规则来源" json:"source"`
	OperatorID     uint   `gorm:"index;not null;default:0;comment:操作人ID" json:"operator_id"`
	Enabled        bool   `gorm:"not null;default:true;index;comment:是否启用" json:"enabled"`
}
