"""Resolve reviewed company source files in a checkout or the packaged worker.

The explicit environment setting is trusted deployment configuration, never an
HTTP/CLI path argument. Imports perform no database, storage or schema work.
"""
import os
import pathlib

SELF = pathlib.Path(__file__).resolve()
RELATIVE_SELF = pathlib.PurePosixPath('ops/backup/lifecycle/company_source_root.py')


def _within(root, relative):
    if not isinstance(relative, str) or not relative or '\\' in relative or '\x00' in relative:
        raise ValueError('Invalid reviewed source path')
    path = pathlib.PurePosixPath(relative)
    if path.is_absolute() or any(part in ('', '.', '..') for part in relative.split('/')):
        raise ValueError('Invalid reviewed source path')
    resolved = (root / pathlib.Path(*path.parts)).resolve(strict=True)
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise ValueError('Reviewed source path escapes its root')
    return resolved


def source_root():
    configured = os.environ.get('MWS_COMPANY_SOURCE_ROOT')
    if configured is not None:
        if not configured or not pathlib.Path(configured).is_absolute():
            raise ValueError('Explicit reviewed source root must be absolute')
        root = pathlib.Path(configured).resolve(strict=True)
    else:
        root = next((parent for parent in SELF.parents if (parent / RELATIVE_SELF).resolve() == SELF), None)
        if root is None:
            raise ValueError('Packaged company source root is not configured')
    if not root.is_dir():
        raise ValueError('Reviewed source root is unavailable')
    # A relocated executing resolver must match the reviewed repo-shaped copy.
    if _within(root, str(RELATIVE_SELF)).read_bytes() != SELF.read_bytes():
        raise ValueError('Executing source resolver differs from reviewed source')
    _within(root, 'ops/backup/lifecycle/backoffice-company-compatibility.proposed.json')
    return root


def source_file(relative):
    return _within(source_root(), relative)


def verify_runtime_copy(filename, relative):
    if pathlib.Path(filename).resolve(strict=True).read_bytes() != source_file(relative).read_bytes():
        raise ValueError('Executing company source differs from its reviewed copy')
