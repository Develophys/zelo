# Zelo — AI agent instructions

Project-wide conventions for whoever (human or AI) is working in this repo. Add to this
file as new conventions get established — don't let them live only in a chat transcript.

## Forms (apps/web)

Forms use **react-hook-form** + **zod**, not hand-rolled `useState` per field.

- One Zod schema per form (or per meaningfully-shared field set), colocated with the
  page/hook that owns it (e.g. `ManagerAdminManagersPage/manager-form-schema.ts`). Infer
  the TS type from it with `z.infer<typeof schema>` — don't hand-write a parallel interface.
- `useForm({ resolver: zodResolver(schema), mode: "onBlur" })`. `onBlur` matches this
  app's existing UX: errors show once a field is left, not on every keystroke.
- Wire native inputs (`TextField`, `SelectField`) with `{...form.register("field")}`
  directly — they accept `ref` as a plain prop (React 19), no `forwardRef` needed. Show
  the error via `form.formState.errors.field?.message`, and derive `aria-invalid`/
  `aria-describedby` from that same check.
- Non-native or unvalidated inputs (a custom picker, a radio group with no validation
  rule, a wizard's "which step" state) don't belong in the form — keep them as plain
  `useState` beside it. Only wire something through `Controller` if it genuinely has a
  validation rule to enforce.
- Branches that share a tree position (steps of a wizard, create-vs-edit) need a
  distinct `key` per branch once any of them mixes `register()`-uncontrolled inputs
  with `value=`-controlled ones — otherwise React can reuse a DOM input across the
  switch and trip its "controlled to uncontrolled" warning.
- Reference implementation: `apps/web/src/presentation/pages/ManagerAdminManagersPage/`
  (`manager-form-schema.ts` + `useManagerCreateFlow.ts`).

Every admin/auth form in `apps/web` follows this convention as of 2026-09-15. A few
plain-`useState` inputs remain by design and are not multi-field validated forms: the
link-institution code step (`LinkInstitutionCodeStep.tsx`), the chat composers, and a
wizard's per-step state — none needs this convention.
