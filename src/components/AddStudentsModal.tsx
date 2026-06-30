"use client";

import { useState, useRef, useMemo } from "react";
import { validateStudentName } from "@/lib/student-name";
import {
  notifyClassroomListChanged,
  notifyRosterChanged,
} from "@/lib/client-lookup-cache";

export type CreatedStudent = {
  id: string;
  number: number | null;
  name: string;
  gender?: string | null;
  qrToken: string;
  textCode: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  classroomId: string;
  onClose: () => void;
  onAdded: (newStudents: CreatedStudent[]) => void;
};

type ParsedStudent = { number: number; name: string };

function parseTextInput(text: string): ParsedStudent[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "1 홍길동", "1  홍길동", "1홍길동", "1\t홍길동" 모두 지원
      const match = line.match(/^(\d+)\s*([가-힣a-zA-Z].+)/);
      if (match) {
        return { number: parseInt(match[1], 10), name: match[2].trim() };
      }
      return null;
    })
    .filter((s): s is ParsedStudent => s !== null);
}

function parseRows(rows: unknown[][]): ParsedStudent[] {
  const students: ParsedStudent[] = [];
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const numVal = row[0];
    const nameVal = row[1];
    const num =
      typeof numVal === "number" ? numVal : parseInt(String(numVal), 10);
    const name = String(nameVal).trim();
    if (!isNaN(num) && num > 0 && name) {
      students.push({ number: num, name });
    }
  }
  return students;
}

function parseCsvData(text: string): ParsedStudent[] {
  return parseRows(
    text
      .split(/\r\n|\n|\r/)
      .map((line) => line.split(",").map((cell) => cell.trim())),
  );
}

async function parseXlsxData(data: ArrayBuffer): Promise<ParsedStudent[]> {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(data, 1);
  return parseRows(rows);
}

export function AddStudentsModal({
  open,
  classroomId,
  onClose,
  onAdded,
}: Props) {
  const [mode, setMode] = useState<"text" | "file">("file");
  const [text, setText] = useState("");
  const [fileStudents, setFileStudents] = useState<ParsedStudent[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const parsed = mode === "text" ? parseTextInput(text) : fileStudents;
  const hasInvalidLines =
    mode === "text" &&
    text.split("\n").filter((l) => l.trim()).length !== parsed.length;

  // 학생별 이름 유효성 검증 - 행 단위 에러 표시 + 1건이라도 오류면 submit 차단.
  const validated = useMemo(
    () =>
      parsed.map((s) => {
        const result = validateStudentName(s.name);
        return {
          number: s.number,
          name: s.name,
          error: result.ok ? null : result.error,
        };
      }),
    [parsed],
  );
  const invalidCount = validated.filter((v) => v.error).length;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isXlsx) {
      alert("지원하는 파일 형식은 .xlsx, .csv 입니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      try {
        const students = isCsv
          ? parseCsvData(String(data ?? ""))
          : await parseXlsxData(data as ArrayBuffer);
        setFileStudents(students);
      } catch {
        alert("파일을 읽을 수 없습니다. 엑셀 또는 CSV 파일을 확인하세요.");
      }
    };
    if (isCsv) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsed.length === 0) return;
    // 이름 검증 실패한 행이 있으면 submit 차단 - early return.
    if (invalidCount > 0) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/classroom/${classroomId}/students`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          students: parsed.map((s) => ({ number: s.number, name: s.name })),
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { students: CreatedStudent[] };
        notifyRosterChanged(classroomId);
        notifyClassroomListChanged();
        onAdded(body.students);
      } else {
        const errBody = await res.json().catch(() => null);
        alert(`학생 추가 실패: ${errBody?.error ?? res.statusText}`);
      }
    } catch (err) {
      console.error(err);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal add-students-modal">
        <div className="modal-header">
          <h2 className="modal-title">학생 일괄 추가</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setMode("file")}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 6,
                border: "1px solid var(--color-border, #e2e8f0)",
                background:
                  mode === "file"
                    ? "var(--color-primary, #3b82f6)"
                    : "transparent",
                color: mode === "file" ? "#fff" : "inherit",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              파일 업로드
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 6,
                border: "1px solid var(--color-border, #e2e8f0)",
                background:
                  mode === "text"
                    ? "var(--color-primary, #3b82f6)"
                    : "transparent",
                color: mode === "text" ? "#fff" : "inherit",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              직접 입력
            </button>
          </div>

          {mode === "file" && (
            <>
              <label className="modal-field-label">
                엑셀 또는 CSV 파일 (A열: 번호, B열: 이름)
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFile}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%",
                  padding: "24px 16px",
                  borderRadius: 8,
                  border: "2px dashed var(--color-border, #cbd5e1)",
                  background: "var(--color-surface, #f8fafc)",
                  cursor: "pointer",
                  textAlign: "center",
                  color: "var(--color-muted, #64748b)",
                }}
              >
                {fileName
                  ? `📄 ${fileName}`
                  : "클릭하여 파일 선택 (.xlsx, .csv)"}
              </button>
              {validated.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 150,
                    overflow: "auto",
                    fontSize: 13,
                    border: "1px solid var(--color-border, #e2e8f0)",
                    borderRadius: 6,
                    padding: 8,
                  }}
                >
                  {validated.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        color: s.error
                          ? "var(--color-danger, #c62828)"
                          : undefined,
                      }}
                    >
                      {s.number}번 {s.name}
                      {s.error && (
                        <span style={{ marginLeft: 8, fontSize: 12 }}>
                          ⚠ {s.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === "text" && (
            <>
              <label className="modal-field-label">
                번호와 이름 (한 줄에 한 명)
              </label>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"1 홍길동\n2 김철수\n3 이영희"}
                rows={8}
                className="modal-textarea add-students-textarea"
              />
            </>
          )}

          <p className="add-students-count">
            {parsed.length > 0
              ? `${parsed.length}명 입력됨`
              : mode === "file"
                ? "파일을 업로드하세요"
                : "번호와 이름을 입력하세요"}
            {hasInvalidLines && (
              <span
                style={{ color: "var(--color-danger, #e53e3e)", marginLeft: 8 }}
              >
                형식 오류가 있는 줄이 있습니다
              </span>
            )}
            {invalidCount > 0 && (
              <span
                role="alert"
                style={{
                  color: "var(--color-danger, #c62828)",
                  marginLeft: 8,
                }}
              >
                이름 오류 {invalidCount}건 - 수정 후 다시 시도해 주세요
              </span>
            )}
          </p>

          {invalidCount > 0 && mode === "text" && (
            <ul
              role="alert"
              style={{
                margin: "4px 0 8px",
                padding: "8px 12px 8px 28px",
                fontSize: 12,
                color: "var(--color-danger, #c62828)",
                background: "var(--color-status-returned-bg, #ffebee)",
                borderRadius: 6,
              }}
            >
              {validated
                .filter((v) => v.error)
                .map((v, i) => (
                  <li key={i}>
                    {v.number}번 “{v.name}” - {v.error}
                  </li>
                ))}
            </ul>
          )}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="modal-btn-cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy || parsed.length === 0 || invalidCount > 0}
              className="modal-btn-submit"
              aria-invalid={invalidCount > 0 ? true : undefined}
            >
              {busy ? "추가 중..." : `${parsed.length}명 추가`}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
