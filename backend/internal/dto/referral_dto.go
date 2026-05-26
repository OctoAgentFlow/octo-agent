package dto

type ReferralInfoResponse struct {
	Code                 string `json:"code"`
	InviteLink           string `json:"invite_link"`
	UseCount             int64  `json:"use_count"`
	SignupInviterPoints  int64  `json:"signup_inviter_points"`
	SignupInviteePoints  int64  `json:"signup_invitee_points"`
	FirstPurchaseRateBps int64  `json:"first_purchase_rate_bps"`
}
