package handler

import (
	"net/http"

	"webmail/internal/middleware"
)

// PartnerHandler handles partner/brand info endpoints.
type PartnerHandler struct{}

// NewPartnerHandler creates a new partner handler.
func NewPartnerHandler() *PartnerHandler {
	return &PartnerHandler{}
}

// Get handles GET /api/partner.
func (h *PartnerHandler) Get(w http.ResponseWriter, r *http.Request) {
	info := middleware.PartnerFromContext(r.Context())
	if info == nil {
		writeJSON(w, http.StatusNotFound, errorResponse{"partner_not_found"})
		return
	}
	writeJSON(w, http.StatusOK, info)
}
