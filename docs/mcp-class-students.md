# Class student MCP adapter

`lib/class-students-tool.ts` prepares the `get_class_students` definition and
executor. It is not registered in the external Moonshot MCP transport yet.
The existing transport's repository and deployment connection are required to
complete that integration. This change adds no HTTP endpoint or database object.

The transport must supply `authorizeMembers` for the **current caller**, using
its validated identity and EDU's existing `members` permission. It must not use
a model-provided actor ID, an anonymous session, or one shared administrator ID
for all callers. The executor rechecks authorization on every invocation, creates
the database client only after authorization and validation, and calls only the
existing `edu_admin_learning_care` read with `get: true`. That function also
checks the operator at the database boundary. Keep credentials server-side.

Register `classStudentsToolDefinition` in the existing transport's tool list and
dispatch its calls to `createClassStudentsTool(dependencies).execute(arguments)`.
Adapt the JSON schema to the transport's existing SDK schema mechanism rather
than replacing its server. Preserve the existing curriculum and status tools.
Do not log the result or store it in shared caches.

Example arguments:

```json
{"cohort":"AI 문샷 챌린지 4기","attention_only":true,"limit":50}
```

The cohort accepts an ID or an exact name, including the course title. Ambiguous
names return an error. Filters combine with AND: `student_name` searches names
only, `progress_range` accepts `all`, `starting`, `progressing`, `finishing` or
`unknown`, and `inactive_only` / `attention_only` use the dashboard's rules.

The adapter reuses `careLearningSnapshot`, `careLearningProgress`,
`careAttention`, and `careAggregate`. It excludes standalone daily missions,
counts only published learning, preserves null progress for unpublished or
invalid configurations, and uses the dashboard overview's first actionable
published lesson as the next lesson. Progress ranges use the unrounded ratio:
below 10%, 10% to below 80%, and 80% or above.

Inactivity uses the existing table's **strictly more than three days** since the
last recorded visit. Attention uses the overview's existing inclusive three-day
threshold with an actionable incomplete item, or a returned submission. Unknown
visits are not inferred to be inactivity. These existing boundary rules remain
separate so neither UI changes behavior.

Output whitelists names and requested learning fields; it excludes emails,
phones, member/enrollment/lesson IDs, question bodies, submitted answers, and
message history. `total_students` is the full cohort's unique member count;
`total_enrollments` retains the dashboard's enrollment count, and
`matching_enrollments` is the count after filters, before pagination. `offset`
and `limit` page the existing database order; `next_offset` is null at the end.
Each response carries the database snapshot's `as_of` timestamp.

Before integration is considered complete, verify the actual MCP tool list,
authenticated 4th-cohort call, administrator screen counts and per-student
progress at the same snapshot/filter, and anonymous/student/unauthorized-staff
denial. The local tests use synthetic records; they do not prove production
deployment or real cohort equality.
