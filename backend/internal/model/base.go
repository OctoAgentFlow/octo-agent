package model

import "time"

type Base struct {
	ID        uint      `gorm:"primaryKey;comment:主键ID" json:"id"`
	CreatedAt time.Time `gorm:"comment:创建时间" json:"created_at"`
	UpdatedAt time.Time `gorm:"comment:更新时间" json:"updated_at"`
}
