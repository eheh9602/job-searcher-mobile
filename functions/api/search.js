/**
 * GET /api/search?keyword=보건관리자
 *
 * 사람인 / 잡코리아 / 인크루트 공개 검색결과 페이지에서 공고 링크와 제목을 수집합니다.
 * 사이트 구조나 차단 정책이 바뀌면 특정 사이트 결과가 비어 있을 수 있습니다.
 * 한 사이트가 실패해도 다른 사이트 결과는 그대로 반환합니다.
 */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
  "Cache-Control": "no-cache",
};

async function fetchText(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getAttr(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = String(attrs || "").match(re);
  return m ? decodeEntities(m[1]).trim() : "";
}

function absoluteUrl(href, base) {
  try {
    return new URL(decodeEntities(href), base).toString();
  } catch {
    return "";
  }
}

function uniqueJobs(jobs, limit = 30) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    if (!job.url || !job.title || seen.has(job.url)) continue;
    seen.add(job.url);
    out.push(job);
    if (out.length >= limit) break;
  }
  return out;
}

function makeJob(source, title, url, extra = {}) {
  return {
    source,
    company: extra.company || "",
    title: stripTags(title),
    location: extra.location || "",
    experience: extra.experience || "",
    employment: extra.employment || "",
    deadline: extra.deadline || "",
    url,
  };
}

function anchors(html) {
  const result = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const href = getAttr(attrs, "href");
    if (!href) continue;
    result.push({
      href,
      titleAttr: getAttr(attrs, "title"),
      text: stripTags(m[2]),
      index: m.index,
    });
  }
  return result;
}

function nearbyText(html, index, before = 600, after = 900) {
  return stripTags(html.slice(Math.max(0, index - before), Math.min(html.length, index + after)));
}

function guessMetaFromNearby(text) {
  const clean = String(text || "");
  const loc = clean.match(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s+[가-힣]+(?:시|군|구)/);
  const exp = clean.match(/(?:신입(?:·경력)?|경력(?:무관|\d+년\s*이상|\d+년↑)?|신입·경력\d*년?↑?)/);
  const emp = clean.match(/(?:정규직|계약직|인턴|파견직|프리랜서|촉탁직|위촉직|시간제|일용직)/);
  const deadline = clean.match(/(?:\d{1,2}\/\d{1,2}\([^)]*\)\s*마감|상시채용|채용시|오늘마감|내일마감|\d{4}[.-]\d{1,2}[.-]\d{1,2})/);
  return {
    location: loc ? loc[0] : "",
    experience: exp ? exp[0] : "",
    employment: emp ? emp[0] : "",
    deadline: deadline ? deadline[0] : "",
  };
}

async function searchSaramin(keyword) {
  const searchUrl = `https://www.saramin.co.kr/zf_user/search/recruit?searchword=${encodeURIComponent(keyword)}&recruitPage=1`;
  const html = await fetchText(searchUrl);
  const jobs = [];

  for (const a of anchors(html)) {
    if (!/rec_idx=\d+/i.test(a.href)) continue;
    const url = absoluteUrl(a.href, "https://www.saramin.co.kr");
    const title = a.titleAttr || a.text;
    if (!title || title.length < 2) continue;
    const meta = guessMetaFromNearby(nearbyText(html, a.index));
    jobs.push(makeJob("사람인", title, url, meta));
  }

  const out = uniqueJobs(jobs, 30);
  if (!out.length) throw new Error("검색 페이지 구조가 바뀌었거나 접근이 제한되었습니다.");
  return out;
}

async function searchJobkorea(keyword) {
  const searchUrl = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(keyword)}`;
  const html = await fetchText(searchUrl);
  const jobs = [];

  for (const a of anchors(html)) {
    if (!/(?:\/Recruit\/GI_Read\/|\/Recruit\/GI_Read\?|GI_Read)/i.test(a.href)) continue;
    const url = absoluteUrl(a.href, "https://www.jobkorea.co.kr");
    const title = a.titleAttr || a.text;
    if (!title || title.length < 2) continue;
    const meta = guessMetaFromNearby(nearbyText(html, a.index));
    jobs.push(makeJob("잡코리아", title, url, meta));
  }

  const out = uniqueJobs(jobs, 30);
  if (!out.length) throw new Error("검색 페이지 구조가 바뀌었거나 접근이 제한되었습니다.");
  return out;
}

async function searchIncruit(keyword) {
  const searchUrl = `https://job.incruit.com/jobdb_list/searchjob.asp?col=job_all&il=y&kw=${encodeURIComponent(keyword)}`;
  const html = await fetchText(searchUrl);
  const jobs = [];

  for (const a of anchors(html)) {
    if (!/jobpost\.asp/i.test(a.href)) continue;
    const url = absoluteUrl(a.href, "https://job.incruit.com");
    const title = a.titleAttr || a.text;
    if (!title || title.length < 2) continue;
    const meta = guessMetaFromNearby(nearbyText(html, a.index));
    jobs.push(makeJob("인크루트", title, url, meta));
  }

  const out = uniqueJobs(jobs, 30);
  if (!out.length) throw new Error("검색 페이지 구조가 바뀌었거나 접근이 제한되었습니다.");
  return out;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const keyword = (url.searchParams.get("keyword") || "보건관리자").trim().slice(0, 80);

  const tasks = [
    ["사람인", () => searchSaramin(keyword)],
    ["잡코리아", () => searchJobkorea(keyword)],
    ["인크루트", () => searchIncruit(keyword)],
  ];

  const results = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  let jobs = [];
  const errors = {};

  results.forEach((result, i) => {
    const name = tasks[i][0];
    if (result.status === "fulfilled") jobs = jobs.concat(result.value);
    else errors[name] = result.reason?.message || String(result.reason);
  });

  // 제목+URL 기준 중복 제거
  const seen = new Set();
  jobs = jobs.filter((job) => {
    const key = `${job.source}|${job.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return new Response(JSON.stringify({ keyword, jobs, errors }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
