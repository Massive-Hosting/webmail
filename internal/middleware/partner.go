package middleware

import (
	"context"
	"net/http"

	"webmail/internal/db"
	"webmail/internal/model"
)

const partnerContextKey contextKey = "partner"

// Partner resolves the partner/brand from the Host header and injects it into context.
func Partner(queries *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			hostname := r.Host
			// Strip port if present.
			if idx := len(hostname) - 1; idx > 0 {
				for i := len(hostname) - 1; i >= 0; i-- {
					if hostname[i] == ':' {
						hostname = hostname[:i]
						break
					}
					if hostname[i] < '0' || hostname[i] > '9' {
						break
					}
				}
			}

			info, _ := queries.GetPartnerByHostname(r.Context(), hostname)
			if info != nil {
				ctx := context.WithValue(r.Context(), partnerContextKey, info)
				r = r.WithContext(ctx)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// PartnerFromContext retrieves the partner info from the request context.
func PartnerFromContext(ctx context.Context) *model.PartnerInfo {
	info, _ := ctx.Value(partnerContextKey).(*model.PartnerInfo)
	return info
}
