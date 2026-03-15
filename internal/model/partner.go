package model

import "time"

// Brand represents a brand with branding assets.
type Brand struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	LogoURL   string    `json:"logo_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Partner represents a hosting partner associated with a brand.
type Partner struct {
	ID           string    `json:"id"`
	BrandID      string    `json:"brand_id"`
	Name         string    `json:"name"`
	Hostname     string    `json:"hostname"`
	PrimaryColor string    `json:"primary_color,omitempty"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// PartnerInfo is the public-facing partner info returned by the API.
type PartnerInfo struct {
	PartnerName  string `json:"partner_name"`
	BrandName    string `json:"brand_name"`
	LogoURL      string `json:"logo_url,omitempty"`
	PrimaryColor string `json:"primary_color,omitempty"`
}
