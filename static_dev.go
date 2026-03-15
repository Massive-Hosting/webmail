//go:build !embedstatic

package webmail

import "embed"

// StaticFiles is empty in dev mode (no embedded frontend build).
var StaticFiles embed.FS

// HasStaticFiles indicates whether the frontend build is embedded.
var HasStaticFiles = false
