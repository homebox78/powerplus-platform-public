// 저장 항목 카드 — 내 저장 상세(/account/saved/:id)와 공유 화면(/c/:token)이 같이 쓴다.
// 출처: homebox-handoff routes/collections.tsx·collection-shared.tsx 의 항목 article 을 ThumbFrame(잠금 막) 으로.
// 잠금 여부·그림 주소는 서버가 Access::can 을 거쳐 준다 — 화면은 받은 그대로 그린다(G30: 숨김을 화면에 맡기지 않는다).
import { FileText, Image as ImageIcon, LayoutTemplate, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { Tag } from "@/components/hb/tag";
import { ThumbFrame } from "@/components/hb/thumb-frame";
import { Button } from "@/components/ui/button";
import type { CollectionItem } from "@/lib/saved";

const ICON = { asset: ImageIcon, gallery: LayoutTemplate, post: FileText } as const;

export function SavedItemCard({ it, onRemove }: { it: CollectionItem; onRemove?: () => void }) {
  const c = it.card;
  const Icon = ICON[it.type];
  const title = c?.title ?? `삭제된 ${it.type_ko}`;
  const thumb = (
    <ThumbFrame ratio="16/10" radius="card" locked={!!c?.locked && it.type !== "gallery"} lockedLabel={c?.lock_label ?? "볼 수 없는 항목"}>
      {c?.image_url ? (
        <img src={c.image_url} alt="" className="absolute inset-0 size-full object-cover object-top" loading="lazy" />
      ) : c?.locked && it.type !== "gallery" ? null : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-4">
          <Icon className="size-7" aria-hidden />
          {!c && <span className="text-sm">삭제되었거나 볼 수 없는 항목</span>}
        </span>
      )}
    </ThumbFrame>
  );
  return (
    <article className="flex min-w-0 flex-col gap-3">
      {c?.page_url && !(c.locked && it.type !== "gallery") ? (
        <Link to={c.page_url} className="block rounded-card focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">{thumb}</Link>
      ) : thumb}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5 text-md font-bold"><Tag tone="line">{it.type_ko}</Tag><span className="truncate">{title}</span></span>
          {c?.subtitle && <span className="truncate text-sm text-ink-4">{c.subtitle}</span>}
        </div>
        {onRemove && <Button variant="ghost" size="icon-sm" aria-label="저장에서 빼기" title="저장에서 빼기" onClick={onRemove}><Trash2 /></Button>}
      </div>
    </article>
  );
}
