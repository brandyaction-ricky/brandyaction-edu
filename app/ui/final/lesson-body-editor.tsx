"use client";

import { lazy, Suspense } from "react";
import type { LessonBodyEditorProps } from "./lesson-rich-input";

// The authoring library loads only when an editor is opened, not in the learner's reader.
const RichInput = lazy(() => import("./lesson-rich-input").then(module => ({ default: module.LessonRichInput })));
export function LessonBodyEditor(props: LessonBodyEditorProps) {
  return <Suspense fallback={<p role="status">편집기를 준비하고 있습니다.</p>}><RichInput {...props} /></Suspense>;
}
