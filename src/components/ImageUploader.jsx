import { useRef } from 'react';
import { Image } from 'lucide-react';

/**
 * 파일 선택 버튼 컴포넌트
 * props:
 *   onFile(file: File) - 이미지 선택 시 호출
 */
export default function ImageUploader({ onFile }) {
  const inputRef = useRef(null);

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onFile(file);
    }
    // 동일 파일 재선택 허용
    e.target.value = '';
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        title="이미지 첨부"
      >
        <Image className="w-4 h-4" />
      </button>
    </>
  );
}
