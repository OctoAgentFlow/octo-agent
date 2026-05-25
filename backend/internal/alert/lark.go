package alert

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type LarkNotifier struct {
	webhookURL string
	secret     string
	client     *http.Client
}

func NewLarkNotifier(webhookURL string, secret string) *LarkNotifier {
	return &LarkNotifier{
		webhookURL: strings.TrimSpace(webhookURL),
		secret:     strings.TrimSpace(secret),
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (n *LarkNotifier) Notify(ctx context.Context, event Event) error {
	payload, err := buildLarkPayload(event, n.secret)
	if err != nil {
		return err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.webhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := n.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("lark webhook returned status %d", resp.StatusCode)
	}
	var result struct {
		Code       int    `json:"code"`
		Msg        string `json:"msg"`
		StatusCode int    `json:"StatusCode"`
		StatusMsg  string `json:"StatusMessage"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err == nil {
		if result.Code != 0 || result.StatusCode != 0 {
			msg := result.Msg
			if msg == "" {
				msg = result.StatusMsg
			}
			return fmt.Errorf("lark webhook rejected alert: code=%d status_code=%d msg=%s", result.Code, result.StatusCode, msg)
		}
	}
	return nil
}

func buildLarkPayload(event Event, secret string) (map[string]any, error) {
	card := map[string]any{
		"config": map[string]any{
			"wide_screen_mode": true,
		},
		"header": map[string]any{
			"template": larkTemplate(event.Level),
			"title": map[string]any{
				"tag":     "plain_text",
				"content": fmt.Sprintf("[%s] %s", strings.ToUpper(event.Level), event.Title),
			},
		},
		"elements": buildLarkCardElements(event),
	}
	payload := map[string]any{
		"msg_type": "interactive",
		"card":     card,
	}
	if strings.TrimSpace(secret) != "" {
		ts := strconv.FormatInt(time.Now().Unix(), 10)
		payload["timestamp"] = ts
		payload["sign"] = larkSign(ts, secret)
	}
	return payload, nil
}

func buildLarkCardElements(event Event) []any {
	fields := []map[string]any{
		larkField("环境", event.Environment),
		larkField("服务", event.Service),
		larkField("级别", strings.ToUpper(event.Level)),
		larkField("分类", event.Category),
		larkField("时间", event.OccurredAt.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02 15:04:05 MST")),
	}
	if event.RequestID != "" {
		fields = append(fields, larkField("请求 ID", event.RequestID))
	}
	if event.UserID > 0 {
		fields = append(fields, larkField("用户 ID", fmt.Sprint(event.UserID)))
	}
	if event.AccountID > 0 {
		fields = append(fields, larkField("X 账号 ID", fmt.Sprint(event.AccountID)))
	}
	if event.ResourceID > 0 {
		fields = append(fields, larkField("资源 ID", fmt.Sprint(event.ResourceID)))
	}
	for _, key := range sortedFieldKeys(event.Fields) {
		fields = append(fields, larkField(key, fmt.Sprint(event.Fields[key])))
	}

	elements := []any{
		map[string]any{
			"tag": "div",
			"text": map[string]any{
				"tag":     "lark_md",
				"content": fmt.Sprintf("**摘要**\n%s", larkEscape(event.Message)),
			},
		},
		map[string]any{"tag": "hr"},
		map[string]any{
			"tag":    "div",
			"fields": fields,
		},
	}
	if errMsg := errorString(event.Error); errMsg != "" {
		elements = append(elements,
			map[string]any{"tag": "hr"},
			map[string]any{
				"tag": "div",
				"text": map[string]any{
					"tag":     "lark_md",
					"content": fmt.Sprintf("**错误详情**\n```text\n%s\n```", larkEscape(errMsg)),
				},
			},
		)
	}
	return elements
}

func larkField(label string, value string) map[string]any {
	return map[string]any{
		"is_short": true,
		"text": map[string]any{
			"tag":     "lark_md",
			"content": fmt.Sprintf("**%s**\n%s", larkEscape(label), larkEscape(value)),
		},
	}
}

func sortedFieldKeys(fields map[string]any) []string {
	if len(fields) == 0 {
		return nil
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		if strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	return keys
}

func larkTemplate(level string) string {
	switch normalizeLevel(level) {
	case LevelCritical:
		return "red"
	case LevelError:
		return "red"
	case LevelWarning:
		return "orange"
	case LevelInfo:
		return "blue"
	default:
		return "grey"
	}
}

func larkSign(timestamp string, secret string) string {
	key := []byte(timestamp + "\n" + secret)
	mac := hmac.New(sha256.New, key)
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func larkEscape(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "`", "'")
	return truncate(s, 1000)
}
