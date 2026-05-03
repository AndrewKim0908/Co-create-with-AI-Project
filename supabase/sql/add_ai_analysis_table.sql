-- AI Analysis 결과 저장 (프로젝트당 스프린트별 1행)
-- 실행 후: Dashboard → Database → Replication 에서 sprint_ai_analysis 가 publication 에 포함됐는지 확인하거나 아래 주석의 ALTER PUBLICATION 실행

CREATE TABLE IF NOT EXISTS public.sprint_ai_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sprint_number INTEGER NOT NULL,
  analysis_result JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(project_id, sprint_number)
);

CREATE INDEX IF NOT EXISTS sprint_ai_analysis_project_id_idx
  ON public.sprint_ai_analysis(project_id);

ALTER TABLE public.sprint_ai_analysis ENABLE ROW LEVEL SECURITY;

-- 소유자 또는 연결된 멤버(user_id 일치): 읽기
CREATE POLICY "sprint_ai_analysis_select"
ON public.sprint_ai_analysis FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = sprint_ai_analysis.project_id
    AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = sprint_ai_analysis.project_id
    AND pm.user_id = auth.uid()
  )
);

-- Owner만 삽입
CREATE POLICY "sprint_ai_analysis_insert"
ON public.sprint_ai_analysis FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = sprint_ai_analysis.project_id
    AND p.user_id = auth.uid()
  )
);

-- Owner만 수정
CREATE POLICY "sprint_ai_analysis_update"
ON public.sprint_ai_analysis FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = sprint_ai_analysis.project_id
    AND p.user_id = auth.uid()
  )
);

ALTER TABLE public.sprint_ai_analysis REPLICA IDENTITY FULL;

-- Realtime: 프로젝트에 따라 한 번만 실행 (이미 있으면 무시될 수 있음)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.sprint_ai_analysis;
