# Jakal Office 릴리스

Office는 `jakal-office`, 문서 엔진은 독립된 외부 의존성 `jakal-hwpx`입니다. 이 저장소에서 문서 엔진 패키지를 발행하지 않습니다. 버전은 `pyproject.toml`에서 관리합니다.

## 개발 검증

```bash
python -m pip install -e ".[web,web-test,release]"
cd web
npm ci
npm run build
npm test
cd ..
python -m pytest web_tests -q
python scripts/check_private_artifacts.py
```

## Python 배포물

```bash
python -m build
python -m twine check dist/jakal_office-*
python -m venv build/smoke-wheel
```

새 환경의 Python으로 `dist/jakal_office-<version>-py3-none-any.whl[web]`을 설치하고 `python -I scripts/check_installed_package.py`를 실행합니다. sdist도 별도의 새 환경에 설치해 같은 검사를 실행합니다. CI가 Python 3.11–3.14에서 이 과정을 검사합니다.

Python wheel은 Office 서버 코드와 변환 스크립트를 담습니다. 전체 편집기 실행에는 웹 빌드 결과, Node.js와 `@rhwp/core`가 필요합니다. 설치형·서버 번들은 아래 빌더로 구성합니다.

## 애플리케이션 패키지

```bash
python scripts/build_server_bundle.py
# Windows에서 실행
python scripts/build_desktop.py
```

Windows 빌더는 외부 모듈을 런타임에 설치해 포함합니다. 서버 번들의 Docker 빌드는 Office wheel 설치 시 외부 모듈을 받습니다. 라이브러리 소스를 앱에 복사하지 않습니다.

GitHub의 **Build application packages** 워크플로로 패키지 빌드와 배포 검사를 수행할 수 있습니다. 저장소에는 원본 모듈의 PyPI 발행 워크플로가 포함되지 않습니다. [배포 안내](deploy/guide.html)와 [문서 보관 정책](docs/document-privacy.md)을 함께 확인하세요.
