"use client";

import { Folder, Library, Plus } from "lucide-react";
import { FormEvent, useState } from "react";

import type { TeacherLibraryCollectionDto } from "@/lib/teacher-library-types";

type Props = {
  collections: TeacherLibraryCollectionDto[];
  activeCollectionId: string;
  totalCount: number;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
};

export function LibrarySidebar({
  collections,
  activeCollectionId,
  totalCount,
  onSelect,
  onCreate,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setName("");
      setCreating(false);
    } catch {
      setError("폴더를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="teacher-library-sidebar" aria-label="라이브러리 폴더">
      <button
        type="button"
        className={`teacher-library-sidebar-item${activeCollectionId === "all" ? " is-active" : ""}`}
        onClick={() => onSelect("all")}
      >
        <Library size={18} aria-hidden="true" />
        <span>전체 자료</span>
        <strong>{totalCount}</strong>
      </button>

      <div className="teacher-library-sidebar-heading">
        <span>컬렉션</span>
        <button
          type="button"
          aria-label="새 폴더 만들기"
          onClick={() => setCreating((value) => !value)}
        >
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>

      {creating ? (
        <>
          <form className="teacher-library-folder-form" onSubmit={submit}>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="폴더 이름"
              maxLength={80}
              aria-label="새 폴더 이름"
            />
            <button type="submit" disabled={!name.trim() || busy}>
              {busy ? "저장 중" : "추가"}
            </button>
          </form>
          {error ? <p className="teacher-library-folder-error" role="alert">{error}</p> : null}
        </>
      ) : null}

      <div className="teacher-library-folder-list">
        {collections.map((collection) => (
          <button
            type="button"
            key={collection.id}
            className={`teacher-library-sidebar-item${activeCollectionId === collection.id ? " is-active" : ""}`}
            onClick={() => onSelect(collection.id)}
          >
            <Folder size={18} aria-hidden="true" />
            <span>{collection.name}</span>
            <strong>{collection.itemCount}</strong>
          </button>
        ))}
      </div>
    </aside>
  );
}
