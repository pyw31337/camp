import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPortalPages, isPortalDeep, portalPagesFor } from "../lib/portal-links.mjs";

const dir = {
  foresttrip: [
    { id: "0193", name: "통고산 자연휴양림", page: "https://www.foresttrip.go.kr/0193" },
    { id: "0999", name: "고산자연휴양림", page: "https://www.foresttrip.go.kr/0999" },
    { id: "ID02030056", name: "교래자연휴양림", page: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030056" },
  ],
  knps: [
    { parkId: "B04", park: "내장산", deptId: "B042001", name: "내장", page: "https://reservation.knps.or.kr/contents/C/serviceGuide.do?prdDvcd=C&parkId=B04&deptId=B042001" },
    { parkId: "B04", park: "내장산", deptId: "B042004", name: "내장호", page: "https://reservation.knps.or.kr/contents/C/serviceGuide.do?prdDvcd=C&parkId=B04&deptId=B042004" },
    { parkId: "B01", park: "지리산", deptId: "B012003", name: "덕동", page: "https://reservation.knps.or.kr/contents/C/serviceGuide.do?prdDvcd=C&parkId=B01&deptId=B012003" },
    { parkId: "B05", park: "덕유산", deptId: "B051002", name: "덕유대1", page: "https://reservation.knps.or.kr/x?deptId=B051002" },
    { parkId: "B05", park: "덕유산", deptId: "B051003", name: "덕유대2", page: "https://reservation.knps.or.kr/x?deptId=B051003" },
  ],
};
const camp = (name, url) => ({ id: 1, name, booking: { url, channels: [{ platform_id: "x", url, kind: "online" }] } });

test("메인 화면으로 가던 공용 예약 링크를 업장 페이지로 바꾸고 원래 주소를 남긴다(멱등)", () => {
  const c = camp("통고산 자연휴양림야영장", "http://www.huyang.go.kr/main.action");
  assert.equal(applyPortalPages(c, dir), 1);
  assert.equal(c.booking.channels[0].url, "https://www.foresttrip.go.kr/0193");
  assert.equal(c.booking.channels[0].registered_url, "http://www.huyang.go.kr/main.action");
  assert.equal(applyPortalPages(c, dir), 0);
});

test("가장 구체적인 이름: 내장호 > 내장, 통고산 > 고산 · 같은 야영장 구역은 첫 구역", () => {
  assert.equal(portalPagesFor(camp("내장산국립공원 내장호야영장", "https://reservation.knps.or.kr/"), dir).knps.id, "B042004");
  assert.equal(portalPagesFor(camp("내장산국립공원 내장야영장", "https://reservation.knps.or.kr/"), dir).knps.id, "B042001");
  assert.equal(portalPagesFor(camp("통고산 자연휴양림야영장", "https://www.foresttrip.go.kr/"), dir).forest.id, "0193");
  assert.equal(portalPagesFor(camp("덕유대자동차야영장", "https://reservation.knps.or.kr/"), dir).knps.id, "B051002");
});

test("공용 예약 사이트를 가리키지 않던 업장(이름만 비슷한 사설)은 건드리지 않는다", () => {
  const c = camp("덕동계곡오토캠핑장", "http://r6.camperstory.com/?1908");
  assert.deepEqual(portalPagesFor(c, dir), {});
  assert.equal(applyPortalPages(c, dir), 0);
  assert.equal(c.booking.channels[0].url, "http://r6.camperstory.com/?1908");
});

test("이미 업장 페이지인 주소는 그대로", () => {
  assert.ok(isPortalDeep("https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030045"));
  assert.ok(isPortalDeep("https://reservation.knps.or.kr/contents/C/serviceGuide.do?prdDvcd=C&parkId=B09&deptId=B091004"));
  assert.ok(!isPortalDeep("https://reservation.knps.or.kr/"));
  assert.ok(!isPortalDeep("https://www.foresttrip.go.kr/main.do"));
  const c = camp("교래자연휴양림야영장", "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030056");
  assert.equal(applyPortalPages(c, dir), 0);
});
