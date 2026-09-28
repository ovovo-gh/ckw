package authz.user

default allow := false

# Only the application entry point is public. It validates login and filters
# private fields itself; database and storage APIs retain their own restrictions.
allow if {
  input.request.method in {"POST", "OPTIONS"}
  input.request.path == "/api"
}
