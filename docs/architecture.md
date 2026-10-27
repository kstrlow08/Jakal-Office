# Jakal Office 구조

Jakal Office는 문서 편집기와 API 서버를 제공하는 애플리케이션입니다. HWP·HWPX 파서와 작성 엔진은 PyPI의 `jakal-hwpx==1.0`을 설치해 사용합니다.

| 구성 | 책임 |
|---|---|
| `web/src/`, `web/studio/` | 문서 화면, 입력, 개체 선택과 레이아웃 도구 |
| `server/` | 업로드, 문서 명령, 작업 큐, 버전·세션·파일 관리 |
| `server/document_backend.py` | 외부 문서 API 연결과 Office의 줄 위치 호환 처리 |
| 외부 `jakal_hwpx` 모듈 | 파일 파싱, 문서 객체, 편집, 검증, 직렬화 |
| 외부 `rhwp` WASM | 원문 편집·렌더링, Node 기반 HWP → HWPX 변환 |
| `web_tests/`, `web/tests/` | Office의 서버·프론트엔드 통합 검사 |

## 문서 모듈 경계

라이브러리 소스, 번들 HWP 프로필, API 문서와 원본 테스트·샘플을 복사하지 않습니다. Office는 `jakal-office`라는 별도 Python 배포물로 빌드되며 `server` 패키지와 Node 변환 스크립트를 포함합니다. `jakal_hwpx`는 의존성 설치 경로에서 로드됩니다.

문서 생성·로드는 `server.document_backend`를 통해 외부 모듈을 사용합니다. `HwpxDocument`의 얇은 하위 클래스는 1.0의 줄 위치 검사에서 줄바꿈·공백·UTF-16 이모지를 잘못 판단하는 사례만 보정합니다. 실제 파싱·편집·수리·저장은 외부 모듈에 위임하며, 모듈 파일이나 전역 클래스를 수정하지 않습니다. 네임스페이스·XML part와 일부 편집 도우미도 외부 모듈에서 가져오므로 의존성 버전을 고정합니다.

작업 프로세스의 `PYTHONPATH`에는 Office 앱 경로만 전달합니다. 로컬 `src/`나 사용자의 임의 `PYTHONPATH`로 라이브러리를 대체하지 않습니다. Docker는 Office를 설치하면서 외부 의존성을 받으며, Windows 패키지도 빌드 시 외부 wheel을 런타임에 설치합니다.

## 의존성 갱신

1. `pyproject.toml`의 `jakal-hwpx` 버전을 변경합니다.
2. 새 버전으로 재설치하고 `web_tests` 전체와 프론트엔드 검사를 실행합니다. 테스트 문서는 `web_tests/documents.py`에서 생성합니다.
3. wheel·sdist를 새 가상환경에 설치한 뒤 `python -I scripts/check_installed_package.py`로 문서 편집·검증을 확인합니다.
4. 모듈에서 줄 위치 문제가 수정되면 호환 override를 제거하고 `test_inline_layout.py`를 그대로 통과하는지 확인합니다.
5. Docker와 설치형 패키지를 다시 빌드합니다.

API와 모듈 변경은 [jakal-hwpx](https://github.com/Ahnd6474/jakal-hwpx)에서 관리합니다. MIT 고지는 설치된 모듈 배포물과 Office의 `LICENSE`, `THIRD_PARTY_NOTICES.md`에 보존합니다.
