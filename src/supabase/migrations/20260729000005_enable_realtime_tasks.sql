-- Enable realtime on tasks so edits (including created_by) sync live across users
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
