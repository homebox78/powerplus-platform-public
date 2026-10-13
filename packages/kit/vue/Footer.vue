<!-- 푸터 — KRDS 「푸터(footer)」
  <Footer org-name="한빛시" logo-src="/img/logo-gray.svg" address="(00000) 한빛시 한빛로 1 한빛시청"
    :contacts="[{ label: '대표전화 000-000-0000', note: '평일 09시~18시' }]"
    :links="[{ label: '찾아오시는 길', href: '/map' }]" :sns="[{ type: 'youtube', href: '…' }]"
    :policy-links="[{ label: '개인정보처리방침', href: '/privacy', point: true }]"
    :related-sites="[{ title: '관련 기관', links: [{ label: '한빛시의회', href: '…' }] }]"
    copyright="© 한빛시. All rights reserved." :identifier="{ orgName: '한빛시' }" />
  관련 사이트 버튼을 누르면 목록이 버튼 줄 아래에 펼쳐진다(aria-expanded · Esc 로 닫기). -->
<script setup lang="ts">
import { computed, ref } from "vue";
import Identifier from "./Identifier.vue";
import { useUid } from "./utils";

type SnsType = "instagram" | "youtube" | "x" | "facebook" | "blog";
interface FooterLink {
  label: string;
  href: string;
  point?: boolean;
}
const props = withDefaults(
  defineProps<{
    orgName: string;
    logoSrc?: string;
    logoAlt?: string;
    address?: string;
    contacts?: Array<{ label: string; note?: string }>;
    links?: FooterLink[];
    sns?: Array<{ type: SnsType; href: string; label?: string }>;
    policyLinks?: FooterLink[];
    copyright?: string;
    relatedSites?: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
    identifier?: { orgName?: string; text?: string; logoSrc?: string; logoAlt?: string };
    id?: string;
  }>(),
  {
    contacts: () => [],
    links: () => [],
    sns: () => [],
    policyLinks: () => [],
    relatedSites: () => [],
    id: "krds-footer",
  },
);
const SNS: Record<SnsType, [string, string]> = {
  instagram: ["인스타그램", "ico-instagram"],
  youtube: ["유튜브", "ico-youtube"],
  x: ["X", "ico-sns-x"],
  facebook: ["페이스북", "ico-facebook"],
  blog: ["블로그", "ico-blog"],
};
const base = useUid("hb-foot");
const openIdx = ref<number | null>(null);
const opened = computed(() => (openIdx.value === null ? null : props.relatedSites[openIdx.value]));
const btns: Array<HTMLButtonElement | null> = [];
function setBtn(i: number, el: unknown) {
  btns[i] = (el as HTMLButtonElement | null) ?? null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && openIdx.value !== null) {
    e.preventDefault();
    btns[openIdx.value]?.focus();
    openIdx.value = null;
  }
}
</script>

<template>
  <footer :id="id" @keydown="onKeyDown">
    <template v-if="relatedSites.length">
      <div class="foot-quick">
        <div class="inner">
          <button
            v-for="(g, i) in relatedSites"
            :key="g.title"
            :ref="(el) => setBtn(i, el)"
            type="button"
            class="link"
            :aria-expanded="openIdx === i"
            :aria-controls="`${base}-rel`"
            @click="openIdx = openIdx === i ? null : i"
          >
            {{ g.title }}
          </button>
        </div>
      </div>
      <div :id="`${base}-rel`" class="hb-foot-related" :hidden="!opened">
        <div v-if="opened" class="inner">
          <p class="hb-foot-related-title">{{ opened.title }}</p>
          <ul>
            <li v-for="l in opened.links" :key="l.href + l.label">
              <a :href="l.href" target="_blank" rel="noopener noreferrer" title="새 창 열기">
                {{ l.label }}<i class="svg-icon ico-go" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </template>
    <div class="inner">
      <div class="f-logo hb-gov-logo">
        <img v-if="logoSrc" :src="logoSrc" :alt="logoAlt ?? orgName" />
        <span v-else class="hb-gov-logo-text">{{ orgName }}</span>
      </div>
      <div class="f-cnt">
        <div class="f-info">
          <p v-if="address" class="info-addr">{{ address }}</p>
          <ul v-if="contacts.length" class="info-cs">
            <li v-for="c in contacts" :key="c.label">
              <strong class="strong">{{ c.label }}</strong><span v-if="c.note" class="span">({{ c.note }})</span>
            </li>
          </ul>
        </div>
        <div v-if="links.length || sns.length" class="f-link">
          <div v-if="links.length" class="link-go">
            <a v-for="l in links" :key="l.href + l.label" :href="l.href" class="krds-btn medium text">
              {{ l.label }} <i class="svg-icon ico-angle right" aria-hidden="true" />
            </a>
          </div>
          <div v-if="sns.length" class="link-sns">
            <a
              v-for="s in sns"
              :key="s.type + s.href"
              :href="s.href"
              class="krds-btn xlarge icon border"
              target="_blank"
              rel="noopener noreferrer"
              title="새 창 열기"
            >
              <span class="sr-only">{{ s.label ?? SNS[s.type][0] }}</span>
              <i :class="['svg-icon', SNS[s.type][1]]" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <slot />
      <div v-if="policyLinks.length || copyright || identifier" class="f-btm">
        <div class="f-btm-text">
          <div v-if="policyLinks.length" class="f-menu">
            <a v-for="l in policyLinks" :key="l.href + l.label" :href="l.href" :class="{ point: l.point }">{{ l.label }}</a>
          </div>
          <p v-if="copyright" class="f-copy">{{ copyright }}</p>
        </div>
        <Identifier v-if="identifier" v-bind="identifier" />
      </div>
    </div>
  </footer>
</template>
