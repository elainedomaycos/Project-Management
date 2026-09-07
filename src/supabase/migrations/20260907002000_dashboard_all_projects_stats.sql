-- ============================================================================
-- ALL PROJECTS DASHBOARD STATS (high-level, read-only aggregates)
-- Run this in Supabase SQL Editor (runs as postgres, bypasses RLS).
-- Idempotent: safe to re-run.
--
-- SECURITY:
--   * SECURITY DEFINER: owner (postgres) reads all rows regardless of RLS.
--   * Returns ONLY high-level aggregates (counts, readiness, health).
--     No task titles, comments, feedback, credentials, timelines, or emails.
--   * EXECUTE granted only to `authenticated`; revoked from PUBLIC/anon.
--   * search_path pinned + all relations schema-qualified (thwart hijack).
--   * STABLE read-only function: no writes possible.
--
-- NOTE: the health algorithm below MUST stay in sync with src/lib/health.ts
-- (computeAutoHealth). If that file changes, update this function too.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_all_projects_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'prefix', p.prefix,
        'finalDefenseDate', p.final_defense_date,
        'tasks', jsonb_build_object(
          'total', ts.total,
          'pending', ts.pending,
          'doing', ts.doing,
          'qa', ts.qa,
          'done', ts.done,
          'overdue', ts.overdue,
          'priorities', ts.priorities,
          'developers', ts.developers
        ),
        'deliverables', jsonb_build_object(
          'total', ds.total,
          'completed', ds.completed,
          'overdue', ds.overdue
        ),
        'defects', jsonb_build_object(
          'openCriticalHigh', dex.open_critical_high
        ),
        'feedbackOpen', (
          SELECT COUNT(*)::int
          FROM public.feedback fb
          WHERE fb.project_id = p.id AND fb.status = 'open'
        ),
        'readiness', CASE
          WHEN ts.total + ds.total > 0
            THEN round(((ts.done + ds.completed)::numeric / (ts.total + ds.total)) * 100)
          ELSE NULL
        END,
        'health', CASE
          -- any incomplete deliverable past its due date -> behind
          WHEN EXISTS (
            SELECT 1 FROM public.defense_deliverables d
            WHERE d.project_id = p.id
              AND d.status <> 'submitted'
              AND d.due_date <> ''
              AND d.due_date < today.d
          )
          -- final defense date reached with incomplete deliverables -> behind
          OR (p.final_defense_date <> '' AND p.final_defense_date <= today.d
              AND EXISTS (
                SELECT 1 FROM public.defense_deliverables d
                WHERE d.project_id = p.id AND d.status <> 'submitted'
              ))
          -- pace: final defense recedes and < 50% of all work done
          OR (p.final_defense_date <> '' AND p.final_defense_date > today.d
              AND ts.total + ds.total > 0
              AND (ts.done + ds.completed)::numeric / (ts.total + ds.total) < 0.5
              AND p.final_defense_date <= to_char(CURRENT_DATE + 14, 'YYYY-MM-DD'))
          -- pace: final defense far and < 25% of all work done
          OR (p.final_defense_date <> '' AND p.final_defense_date > today.d
              AND ts.total + ds.total > 0
              AND (ts.done + ds.completed)::numeric / (ts.total + ds.total) < 0.25
              AND p.final_defense_date <= to_char(CURRENT_DATE + 30, 'YYYY-MM-DD'))
          THEN 'behind'
          -- any incomplete deliverable due within 7 days -> at_risk
          WHEN EXISTS (
            SELECT 1 FROM public.defense_deliverables d
            WHERE d.project_id = p.id
              AND d.status <> 'submitted'
              AND d.due_date <> ''
              AND d.due_date <= to_char(CURRENT_DATE + 7, 'YYYY-MM-DD')
          )
          -- pace: <= 30 days out and < 25% of all work done -> at_risk
          OR (p.final_defense_date <> '' AND p.final_defense_date > today.d
              AND ts.total + ds.total > 0
              AND (ts.done + ds.completed)::numeric / (ts.total + ds.total) < 0.25
              AND p.final_defense_date <= to_char(CURRENT_DATE + 30, 'YYYY-MM-DD'))
          THEN 'at_risk'
          ELSE 'on_track'
        END
      )
      ORDER BY p.name
    ),
    '[]'::jsonb
  )
  FROM public.projects p
  CROSS JOIN today
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE t.status = 'doing')::int AS doing,
      COUNT(*) FILTER (WHERE t.status = 'qa')::int AS qa,
      COUNT(*) FILTER (WHERE t.status = 'done')::int AS done,
      COUNT(*) FILTER (
        WHERE t.due_date <> '' AND t.due_date < today.d AND t.status <> 'done'
      )::int AS overdue,
      jsonb_build_object(
        'critical', COUNT(*) FILTER (WHERE t.priority = 'critical')::int,
        'high',     COUNT(*) FILTER (WHERE t.priority = 'high')::int,
        'medium',   COUNT(*) FILTER (WHERE t.priority = 'medium')::int,
        'low',      COUNT(*) FILTER (WHERE t.priority = 'low')::int
      ) AS priorities,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('name', dg.name, 'total', dg.total, 'done', dg.done, 'pct', dg.pct)
          ORDER BY dg.pct DESC NULLS LAST
        )
        FROM (
          SELECT
            t2.developer AS name,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE t2.status = 'done') AS done,
            CASE WHEN COUNT(*) > 0
              THEN round((COUNT(*) FILTER (WHERE t2.status = 'done')::numeric / COUNT(*)) * 100)
              ELSE NULL
            END AS pct
          FROM public.tasks t2
          WHERE t2.project_id = p.id AND btrim(t2.developer) <> ''
          GROUP BY t2.developer
        ) dg
      ), '[]'::jsonb) AS developers
    FROM public.tasks t
    WHERE t.project_id = p.id
  ) ts
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE d.status = 'submitted')::int AS completed,
      COUNT(*) FILTER (
        WHERE d.status <> 'submitted' AND d.due_date <> '' AND d.due_date < today.d
      )::int AS overdue
    FROM public.defense_deliverables d
    WHERE d.project_id = p.id
  ) ds
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (
        WHERE df.status = 'Open' AND df.severity IN ('High', 'Critical')
      )::int AS open_critical_high
    FROM public.defects df
    WHERE df.project_id = p.id
  ) dex
  WHERE COALESCE(p.archived_at, '') = '';
$$;

REVOKE ALL ON FUNCTION public.get_all_projects_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_projects_dashboard_stats() TO authenticated;