/**
 * GET /api/search?keyword=보건관리자
 *
 * v2
 * - 사람인 / 잡코리아 / 인크루트 검색
 * - 인크루트 EUC-KR 한글 깨짐 보정
 * - 검색결과 목록에서 가능한 범위 내 회사명/지역/경력/고용형태/마감 추출
 * - 상세정보는 이후 /api/detail 에서 다시 읽어 보강
 */

"use strict";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0 Safari/537.36",

  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

  "Accept-Language":
    "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5",
};


/* =========================================================
   공통 유틸
========================================================= */

async function fetchHtml(url, encoding = "utf-8") {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();

  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch (err) {
    // 혹시 특정 인코딩 디코딩이 실패하면 UTF-8로 한 번 더 시도
    return new TextDecoder("utf-8").decode(buffer);
  }
}


function decodeEntities(str) {
  if (!str) return "";

  return String(str)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/&#40;/gi, "(")
    .replace(/&#41;/gi, ")")
    .replace(/&#91;/gi, "[")
    .replace(/&#93;/gi, "]")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return _;
      }
    });
}


function stripTags(str) {
  if (!str) return "";

  return decodeEntities(
    String(str)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<\/div>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}


function cleanText(str) {
  return stripTags(str || "")
    .replace(/\s+/g, " ")
    .trim();
}


function getAttr(tag, name) {
  const re = new RegExp(
    `${name}\\s*=\\s*["']([^"']*)["']`,
    "i"
  );

  const m = String(tag || "").match(re);

  return m ? decodeEntities(m[1]).trim() : "";
}


function absoluteUrl(base, href) {
  if (!href) return "";

  try {
    return new URL(decodeEntities(href), base).toString();
  } catch {
    return "";
  }
}


/* =========================================================
   제목에서 회사명 추론
========================================================= */

function inferCompanyFromTitle(title) {
  const text = cleanText(title);

  if (!text) return "";

  /*
   * 예:
   * [인천백병원] 보건관리자 간호사를 모집합니다.
   * [해운대자생한방병원] QPS/보건관리자 업무 채용
   */

  const bracket = text.match(/^\[([^\]]{2,40})\]/);

  if (bracket) {
    const candidate = bracket[1].trim();

    // 회사명이 아니라 채용 카테고리일 가능성이 큰 문구 제외
    const genericWords = [
      "신입",
      "경력",
      "신입/경력",
      "채용",
      "공채",
      "수시채용",
      "광학솔루션",
      "생산",
      "안전",
      "보건",
      "서울",
      "경기",
      "인천",
      "부산",
      "대구",
      "대전",
      "광주",
      "울산",
      "제주",
    ];

    const generic = genericWords.some(
      (word) => candidate === word
    );

    if (!generic) {
      return candidate;
    }
  }

  return "";
}


/* =========================================================
   목록 주변 텍스트에서 부가정보 추론
========================================================= */

const REGIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "대전",
  "광주",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];


function inferLocation(text) {
  const t = cleanText(text);

  if (!t) return "";

  const regionPattern = REGIONS.join("|");

  /*
   * 경기 화성시
   * 서울 강남구
   * 충남 천안시
   * 인천 중구
   */

  const m = t.match(
    new RegExp(
      `(${regionPattern})\\s+([가-힣]{1,12}(?:시|군|구))`
    )
  );

  if (m) {
    return `${m[1]} ${m[2]}`;
  }

  const simple = t.match(
    new RegExp(`(${regionPattern})`)
  );

  return simple ? simple[1] : "";
}


function inferEmployment(text) {
  const t = cleanText(text);

  const types = [
    "정규직",
    "계약직",
    "인턴",
    "파견직",
    "프리랜서",
    "위촉직",
    "촉탁직",
    "시간제",
    "아르바이트",
  ];

  for (const type of types) {
    if (t.includes(type)) {
      return type;
    }
  }

  return "";
}


function inferExperience(text) {
  const t = cleanText(text);

  if (!t) return "";

  const patterns = [
    /경력무관/,
    /신입\s*[·\/,]?\s*경력\s*\d*\s*년?\s*↑?/,
    /신입\s*[·\/,]?\s*경력/,
    /경력\s*\d+\s*[~-]\s*\d+\s*년/,
    /경력\s*\d+\s*년\s*↑/,
    /경력\s*\d+\s*년\s*이상/,
    /경력\s*\d+\s*년/,
    /신입/,
    /경력/,
  ];

  for (const re of patterns) {
    const m = t.match(re);

    if (m) {
      return m[0].replace(/\s+/g, "");
    }
  }

  return "";
}


function inferEducation(text) {
  const t = cleanText(text);

  const values = [
    "학력무관",
    "고졸",
    "초대졸",
    "대졸",
    "대학교졸업",
    "대학졸업",
    "석사",
    "박사",
  ];

  for (const value of values) {
    if (t.includes(value)) {
      return value;
    }
  }

  return "";
}


function inferDeadline(text) {
  const t = cleanText(text);

  if (!t) return "";

  if (/상시채용/.test(t)) return "상시채용";
  if (/채용시/.test(t)) return "채용시";
  if (/오늘마감/.test(t)) return "오늘마감";
  if (/내일마감/.test(t)) return "내일마감";

  /*
   * 09/17(목) 마감
   * ~09.17
   * ~ 09/17
   */

  const date = t.match(
    /~?\s*(\d{1,2})[./](\d{1,2})(?:\s*\([가-힣]\))?\s*(?:마감)?/
  );

  if (date) {
    return `${date[1].padStart(2, "0")}.${date[2].padStart(2, "0")}`;
  }

  return "";
}


/*
 * 검색결과의 <a> 주변 HTML을 조금 잘라서
 * 지역/경력/고용형태 등의 힌트를 찾는다.
 */
function getContext(html, index, before = 1000, after = 1800) {
  const start = Math.max(0, index - before);
  const end = Math.min(html.length, index + after);

  return html.slice(start, end);
}


/* =========================================================
   회사명 HTML 추론
========================================================= */

function inferCompanyFromContext(context, source) {
  const html = String(context || "");

  const patterns = source === "사람인"
    ? [
        /class=["'][^"']*corp_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        /class=["'][^"']*corp_name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      ]
    : source === "잡코리아"
    ? [
        /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        /class=["'][^"']*corp[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      ]
    : [
        /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        /class=["'][^"']*cpname[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      ];

  for (const re of patterns) {
    const m = html.match(re);

    if (m) {
      const company = cleanText(m[1]);

      if (
        company &&
        company.length >= 2 &&
        company.length <= 50
      ) {
        return company;
      }
    }
  }

  return "";
}


/* =========================================================
   사람인
========================================================= */

async function searchSaramin(keyword) {
  const base = "https://www.saramin.co.kr";

  const url =
    `${base}/zf_user/search/recruit` +
    `?searchword=${encodeURIComponent(keyword)}` +
    `&recruitPage=1`;

  const html = await fetchHtml(url, "utf-8");

  const jobs = [];
  const seen = new Set();

  /*
   * 기존처럼 attribute 순서에 의존하지 않고
   * str_tit 클래스가 있는 a 태그 전체를 잡는다.
   */

  const re =
    /<a\b[^>]*class=["'][^"']*\bstr_tit\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;

  let m;

  while ((m = re.exec(html)) !== null) {
    const tag = m[0];

    const hrefRaw = getAttr(tag, "href");

    if (!hrefRaw || !/rec_idx=\d+/i.test(hrefRaw)) {
      continue;
    }

    const href = absoluteUrl(base, hrefRaw);

    if (!href || seen.has(href)) continue;

    const title =
      cleanText(getAttr(tag, "title")) ||
      cleanText(tag);

    if (!title) continue;

    seen.add(href);

    const context = getContext(html, m.index);

    const company =
      inferCompanyFromContext(context, "사람인") ||
      inferCompanyFromTitle(title);

    jobs.push({
      source: "사람인",
      company,
      title,
      location: inferLocation(context),
      employment: inferEmployment(context),
      experience: inferExperience(context),
      education: inferEducation(context),
      deadline: inferDeadline(context),
      url: href,
    });

    if (jobs.length >= 30) break;
  }

  if (!jobs.length) {
    throw new Error(
      "사람인에서 공고를 찾지 못했습니다. 사이트 구조가 변경되었을 수 있습니다."
    );
  }

  return jobs;
}


/* =========================================================
   잡코리아
========================================================= */

async function searchJobkorea(keyword) {
  const base = "https://www.jobkorea.co.kr";

  const url =
    `${base}/Search/?stext=${encodeURIComponent(keyword)}`;

  const html = await fetchHtml(url, "utf-8");

  const jobs = [];
  const seen = new Set();

  /*
   * /Recruit/GI_Read/... 주소를 가진 a 태그
   */

  const re =
    /<a\b[^>]*href=["']([^"']*\/Recruit\/GI_Read\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;

  let m;

  while ((m = re.exec(html)) !== null) {
    const tag = m[0];

    const href = absoluteUrl(base, m[1]);

    if (!href || seen.has(href)) continue;

    const title =
      cleanText(getAttr(tag, "title")) ||
      cleanText(tag);

    if (!title) continue;

    /*
     * 너무 짧거나 단순 회사명 링크인 경우 제외.
     * 실제 공고 제목만 최대한 남긴다.
     */

    if (title.length < 4) continue;

    seen.add(href);

    const context = getContext(
      html,
      m.index,
      1200,
      2200
    );

    const company =
      inferCompanyFromContext(context, "잡코리아") ||
      inferCompanyFromTitle(title);

    jobs.push({
      source: "잡코리아",
      company,
      title,
      location: inferLocation(context),
      employment: inferEmployment(context),
      experience: inferExperience(context),
      education: inferEducation(context),
      deadline: inferDeadline(context),
      url: href,
    });

    if (jobs.length >= 30) break;
  }

  if (!jobs.length) {
    throw new Error(
      "잡코리아에서 공고를 찾지 못했습니다. 사이트 구조가 변경되었을 수 있습니다."
    );
  }

  return jobs;
}


/* =========================================================
   인크루트
========================================================= */

async function searchIncruit(keyword) {
  const base = "https://job.incruit.com";

  const url =
    `${base}/jobdb_list/searchjob.asp` +
    `?col=job_all&il=y&kw=${encodeURIComponent(keyword)}`;

  /*
   * ★ 핵심 수정
   * 인크루트 HTML을 EUC-KR로 디코딩
   */
  const html = await fetchHtml(url, "euc-kr");

  const jobs = [];
  const seen = new Set();

  /*
   * jobdb_info/jobpost.asp 상세공고 링크
   */

  const re =
    /<a\b[^>]*href=["']([^"']*jobdb_info\/jobpost\.asp[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi;

  let m;

  while ((m = re.exec(html)) !== null) {
    const tag = m[0];

    const href = absoluteUrl(base, m[1]);

    if (!href || seen.has(href)) continue;

    const title =
      cleanText(getAttr(tag, "title")) ||
      cleanText(tag);

    if (!title || title.length < 4) continue;

    seen.add(href);

    const context = getContext(
      html,
      m.index,
      1300,
      2500
    );

    const company =
      inferCompanyFromContext(context, "인크루트") ||
      inferCompanyFromTitle(title);

    jobs.push({
      source: "인크루트",
      company,
      title,
      location: inferLocation(context),
      employment: inferEmployment(context),
      experience: inferExperience(context),
      education: inferEducation(context),
      deadline: inferDeadline(context),
      url: href,
    });

    if (jobs.length >= 30) break;
  }

  if (!jobs.length) {
    throw new Error(
      "인크루트에서 공고를 찾지 못했습니다. 사이트 구조가 변경되었을 수 있습니다."
    );
  }

  return jobs;
}


/* =========================================================
   중복 제거
========================================================= */

function dedupeJobs(jobs) {
  const seen = new Set();

  return jobs.filter((job) => {
    const key =
      `${job.source}|${job.url}`.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}


/* =========================================================
   Cloudflare Pages Function
========================================================= */

export async function onRequestGet(context) {
  const { request } = context;

  const requestUrl = new URL(request.url);

  const keyword =
    requestUrl.searchParams.get("keyword")?.trim() ||
    "보건관리자";

  const tasks = [
    ["사람인", () => searchSaramin(keyword)],
    ["잡코리아", () => searchJobkorea(keyword)],
    ["인크루트", () => searchIncruit(keyword)],
  ];

  const results = await Promise.allSettled(
    tasks.map(([, fn]) => fn())
  );

  let jobs = [];

  const errors = {};

  results.forEach((result, index) => {
    const source = tasks[index][0];

    if (result.status === "fulfilled") {
      jobs.push(...result.value);
    } else {
      errors[source] =
        result.reason?.message ||
        String(result.reason);
    }
  });

  jobs = dedupeJobs(jobs);

  return new Response(
    JSON.stringify(
      {
        keyword,
        count: jobs.length,
        jobs,
        errors,
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store, max-age=0",
      },
    }
  );
}
