# Tracker decision

TestRail removed.

The Core listed Jira + TestRail. The build pack already forbids that tool: `00_HOW_WE_BUILD.md` refuses a TestRail clone, `02_BUDGET_AND_TOOLS.md` says do not buy TestRail, `01_ARCHITECTURE.md` keeps test management in internal tables, and the platform README says "No TestRail." ai-qa has a Jira adapter and its own case tables. It has no TestRail client.

Cases and results stay in SQLite. Jira stays the only external tracker. No TestRail CSV or API export will be added.
