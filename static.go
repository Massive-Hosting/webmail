//go:build embedstatic

package webmail

import "embed"

//go:embed all:web/dist
var StaticFiles embed.FS

// HasStaticFiles indicates whether the frontend build is embedded.
var HasStaticFiles = true
