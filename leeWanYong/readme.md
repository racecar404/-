# 이완용 자서전 일당기사 번역

⚠️ **본 번역본은 AI를 활용하여 생성된 초벌 번역본(Draft Translation)** 입니다.  
정확성과 뉘앙스를 위해 후속 인문학적·전문가 검토가 필요합니다.

<br>

## 개요

해당문서는 이완용의 자서전 '일당기사' 의 초벌 번역본입니다. 일본어와 간문이 혼합된 OCR 처리 후, refine과정을 거쳐 한국어와 영어로 병렬 번역하는 전체 절차를 정리한 것입니다.

<br>

## 처리 절차

### 1. 이미지 수집

- [국립중앙박물관](https://www.nl.go.kr/NL/contents/search.do?pageNum=1&pageSize=30&srchTarget=total&kwd=%E4%B8%80%E5%A0%82%E7%B4%80%E4%BA%8B#viewKey=CNTS-00047997328&viewType=C&category=%EB%8F%84%EC%84%9C&pageIdx=1&jourId=)에서 디지털 사본을 스크랩

### 2. OCR (문자인식)

- **Google Cloud Vision API**의 `documentTextDetection` 사용.
- `languageHints: ["ja"]`로 설정하여 일본어 세로조판 인식할 수 있도록 함.
- 일본어 OCR 결과가 부정확한 경우, 동일 페이지를 `["zh-Hant"]`로 재처리하여 간문 후보를 확보.
- 각 페이지의 OCR 결과를 텍스트 파일(`ocr/` 디렉토리)에 저장.

### 3. 텍스트 정제

- OCR 과정에서 발생한 세로조판 줄바꿈 및 단어 중간 분할을 정규식으로 제거 및 병합.
- 페이지별 정제 결과를 `cleaned_paragraphs.txt`로 저장합니다.

### 4. 일본어 / 간문 구분

- 정제된 텍스트를 문단 단위로 분할한 뒤, 규칙 기반으로 언어를 태깅합니다.
  - 히라가나/가타카나가 거의 없고 고전 한문 문장 구조가 뚜렷할 경우 → `kanbun`
  - 그 외 일반 일본어 문장 → `japanese`
- 결과는 `paragraphs.tagged.jsonl` 형태로 저장되며, 각 문단에 다음 정보가 포함됩니다.

```json
{
  "page_id": 200,
  "lang": "kanbun",
  "cleaned_text": "..."
}
```

### 5. 번역 전처리

- GPT 모델의 토큰 제한을 고려해 전체 문단을 입력 가능 단위로 나눔.
- 하나의 batch량을 3000토큰으로 설정하여, 문단이 중간에 잘리지 않도록 조정.
- 한 번에 번역할 때 발생할 수 있는 문맥 손실 최소화.

### 6. 번역

각 batch를 gpt-5 모델로 전송하여 번역 수행

<br>

## 📚 용어 고정 (Glossary)

다음 표기는 번역 과정 전반에서 고정적으로 사용되었습니다.

| 원문     | 영어                  | 한국어            |
| -------- | --------------------- | ----------------- |
| 李完用   | Yi Wan-yong           | 이완용            |
| 伊藤博文 | Itō Hirobumi          | 이토 히로부미     |
| 寺内正毅 | Terauchi Masatake     | 데라우치 마사타케 |
| 齋藤實   | Saitō Makoto          | 사이토 마코토     |
| 中樞院   | Privy Council (Korea) | 중추원            |
| 併合     | Annexation (1910)     | 한일병합          |
| 一堂紀事 | It-tang Kiji          | 일당기사          |

---

```

```
