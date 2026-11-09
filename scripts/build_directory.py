"""Validate a complete build beside dist before activating it.

Only the short directory switch is serialized. A failed build never edits the
current output; a failed activation restores it before returning an error.
"""
from contextlib import contextmanager
from pathlib import Path
import fcntl
import os
import shutil
import tempfile


@contextmanager
def build_directory(destination):
    destination = Path(destination)
    parent = destination.parent.resolve()
    destination = parent / destination.name
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        raise ValueError('Build output must be a real directory: ' + str(destination))
    workspace = Path(tempfile.mkdtemp(prefix='.' + destination.name + '-build-', dir=parent))
    candidate, previous = workspace / 'candidate', workspace / 'previous'
    candidate.mkdir()
    preserve_previous = False
    try:
        yield candidate
        # Lock the parent directory itself, so parallel builds cannot interleave
        # their two renames. No persistent lock file or service lock is created.
        descriptor = os.open(parent, os.O_RDONLY)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            had_previous = destination.exists()
            if destination.is_symlink() or (had_previous and not destination.is_dir()):
                raise ValueError('Build output changed to an unsafe path: ' + str(destination))
            try:
                if had_previous:
                    os.replace(destination, previous)
                os.replace(candidate, destination)
            except BaseException as activation_error:
                if previous.exists():
                    try:
                        # A signal can arrive just after rename has succeeded.
                        # Move the new candidate aside if it was already active.
                        if destination.exists():
                            os.replace(destination, candidate)
                        os.replace(previous, destination)
                    except BaseException as recovery_error:
                        if previous.exists():
                            # Never delete the only recoverable prior output.
                            preserve_previous = True
                            raise RuntimeError(
                                'Build activation and recovery failed; previous output retained at '
                                + str(previous) + ': ' + str(recovery_error)
                            ) from activation_error
                        # The recovery rename succeeded before an interrupt.
                elif not had_previous and destination.exists() and not candidate.exists():
                    # A first activation interrupted after its rename must not
                    # leave output behind while reporting a failed command.
                    os.replace(destination, candidate)
                raise

        finally:
            os.close(descriptor)
    finally:
        if previous.exists() and not destination.exists():
            preserve_previous = True
        if not preserve_previous:
            # Cleanup must not turn a successful activation into a false failure,
            # nor mask the original build error if a temporary file is locked.
            shutil.rmtree(workspace, ignore_errors=True)
