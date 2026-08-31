국내 증시 브리핑 — 배포용 PWA 패키지
================================

이 폴더는 그대로 정적 웹 호스팅에 올리면 되는 완성된 PWA예요.
(index.html, manifest.json, sw.js, icons/ 4개 파일 세트)

[가장 빠른 방법] Netlify Drop — 계정 없이 1분
1. https://app.netlify.com/drop 접속
2. 이 폴더(am-briefing-pwa) 전체를 브라우저 화면에 드래그 앤 드롭
3. 몇 초 뒤 발급되는 https://xxxx.netlify.app 주소로 바로 접속 가능
4. 계속 쓰려면 화면 안내에 따라 무료 계정으로 "Claim"하면 주소가 고정돼요
   (Claim 안 하면 며칠 뒤 사이트가 정리될 수 있어요)

[정식으로 계속 관리하고 싶다면] Netlify / Vercel 계정 연결
- Netlify: 계정 로그인 → "Add new site" → "Deploy manually" → 이 폴더를 업로드
- Vercel: 계정 로그인 후 터미널에서
    npx vercel --prod
  실행 후 이 폴더 경로를 지정하면 배포돼요 (최초 1회 로그인 필요)
- 둘 다 GitHub 저장소에 이 폴더를 올려두고 저장소를 연결하면,
  이후 파일만 갱신해서 다시 올리면 자동 재배포돼요.

배포 후 폰 브라우저로 접속해서
- Android(Chrome): 메뉴 → "홈 화면에 추가"
- iOS(Safari): 공유 버튼 → "홈 화면에 추가"
를 누르면 앱처럼 아이콘이 생기고 전체 화면으로 실행돼요.

주의
- 지금 담긴 시세·뉴스 데이터는 2026.08.27 스냅샷이에요. 매일 자동으로
  바뀌게 하려면 별도 서버(또는 자동화 스크립트)가 index.html의 데이터
  부분을 주기적으로 갱신해서 재배포해줘야 해요.
- 관심종목은 브라우저(기기)별로 저장돼요. 로그인 계정 동기화는 아직 없어요.

카카오톡/슬랙 등에 링크 공유 시 미리보기 카드
- index.html <head>에 og:title / og:description / og:image(og-image.png,
  1200x630) 태그를 넣어뒀어요. 배포하면 카톡·슬랙·트위터 등에 링크를
  붙여넣을 때 앱 소개 카드가 자동으로 떠요.
- 실제 배포 주소(https://am-briefing-pwa.vercel.app/)가 확정돼서
  og:image, twitter:image, og:url을 전부 그 절대경로로 이미 넣어뒀어요.
  도메인을 나중에 바꾸면 이 3곳도 같이 바꿔주세요.
- 이 버전으로 다시 배포(재업로드)해야 카톡 미리보기에 이미지가 떠요.
  이전에 올린 버전에는 og-image.png가 없어서 카드가 안 뜰 거예요.
- 카톡 공유 미리보기가 바로 안 뜨면, 카카오 디버거
  (https://developers.kakao.com/tool/debugger/sharing) 에 배포 주소를
  넣고 "초기화" 하면 캐시가 갱신돼요.
