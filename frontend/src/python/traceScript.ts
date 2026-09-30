import { MAX_TRACE_CELLS, MAX_TRACE_STEPS, MAX_VALUE_CELLS } from "./trace";

/**
 * The tracer, as real Python.
 *
 * Runs the user's code under `sys.settrace` and returns a JSON document with one
 * record per executed line: the locals in scope, the call stack, and everything
 * printed so far. The caller puts the source in the `_ddc_source` global and
 * reads the JSON from the expression value of the last statement.
 *
 * Only frames whose filename is `main.py` are recorded, so stepping never
 * descends into the standard library.
 *
 * Each local carries a `repr` and, when the value is a container, a shallow
 * structured `value`: cells for a sequence, entries for a mapping, rows for a
 * rectangular grid, nodes and edges for an adjacency map. Describing the shape
 * here rather than parsing `repr` in the browser is the difference between
 * knowing a list has five elements and guessing it from a string that may
 * itself have been truncated.
 *
 * Structure is deliberately one level deep. A nested element is rendered as its
 * own short repr, which keeps the payload bounded — this document is published
 * into the room's shared metadata, so every byte is replicated to both people.
 */
export const TRACE_SCRIPT = `
import io, json, sys, traceback, types

MAX_STEPS = ${MAX_TRACE_STEPS}
MAX_REPR = 140
MAX_LOCALS = 24
MAX_STACK = 8
MAX_STDOUT_PER_STEP = 2000
FILENAME = 'main.py'

# Structured values: how many cells one container may show, how long one cell's
# repr may be, and the budget for the trace as a whole. Past the budget the
# locals keep their repr and lose the structure, so a pathological program
# degrades to what the tracer produced before rather than to an unusable payload.
MAX_CELLS = ${MAX_VALUE_CELLS}
MAX_CELL_REPR = 24
CELL_BUDGET = ${MAX_TRACE_CELLS}
cells_used = 0

# Values that are never interesting as "variables" in a teaching trace.
# The typing aliases matter in practice: \`from typing import List, Tuple\` at the
# top of a starter file would otherwise fill the variable list before the first
# real assignment.
SKIP_KINDS = {
    'module', 'function', 'builtin_function_or_method', 'type',
    'method', 'method-wrapper', 'wrapper_descriptor', 'classmethod_descriptor',
    '_SpecialGenericAlias', '_GenericAlias', '_SpecialForm', '_TupleType',
    '_CallableType', '_UnionGenericAlias', '_LiteralGenericAlias', 'TypeVar',
}
SKIP_NAMES = {'__name__', '__builtins__', '__package__', '__doc__', '__loader__', '__spec__'}

source = _ddc_source
out_buffer = io.StringIO()
err_buffer = io.StringIO()
steps = []
truncated = False


def cell(value):
    """One element inside a container, as a short repr."""
    try:
        text = repr(value)
    except Exception:
        return '<?>'
    if len(text) > MAX_CELL_REPR:
        text = text[:MAX_CELL_REPR - 1] + '\\u2026'
    return text


def is_scalar(value):
    return value is None or isinstance(value, (bool, int, float, complex, str, bytes))


def adjacency(mapping):
    """A mapping from node to neighbours, or None if it is not one.

    The test is deliberately strict — every value must be a collection, and
    every neighbour must itself be a key — because the alternative reading of a
    dict is a plain lookup table, which is far more common and would be worse
    to draw as a graph.
    """
    if not mapping or len(mapping) > MAX_CELLS:
        return None
    keys = list(mapping.keys())
    if not all(is_scalar(k) for k in keys):
        return None
    known = set(keys)
    edges = []
    for source, targets in mapping.items():
        if not isinstance(targets, (list, tuple, set, frozenset)):
            return None
        for target in targets:
            if not is_scalar(target) or target not in known:
                return None
            edges.append([cell(source), cell(target)])
            if len(edges) > MAX_CELLS * 4:
                return None
    if not edges:
        return None
    return {'t': 'graph', 'nodes': [cell(k) for k in keys], 'edges': edges}


def structure(value):
    """A shallow structured view of a container, or None for a plain scalar."""
    if isinstance(value, str):
        # Indexed characters: the shape every string problem is really about.
        if not value:
            return None
        return {'t': 'text', 'chars': list(value[:MAX_CELLS]), 'n': len(value)}

    if isinstance(value, (list, tuple)):
        items = list(value)
        # A rectangular list of lists of scalars reads as a grid, not as a list
        # of opaque rows.
        if items and all(isinstance(row, (list, tuple)) for row in items):
            widths = {len(row) for row in items}
            if len(widths) == 1 and len(items) <= MAX_CELLS and widths.pop() <= MAX_CELLS:
                if all(is_scalar(c) for row in items for c in row):
                    return {
                        't': 'grid',
                        'kind': type(value).__name__,
                        'rows': [[cell(c) for c in row] for row in items],
                    }
        return {
            't': 'seq',
            'kind': type(value).__name__,
            'items': [cell(v) for v in items[:MAX_CELLS]],
            'n': len(items),
        }

    if isinstance(value, dict):
        graph = adjacency(value)
        if graph is not None:
            return graph
        entries = list(value.items())
        return {
            't': 'map',
            'kind': type(value).__name__,
            'entries': [[cell(k), cell(v)] for k, v in entries[:MAX_CELLS]],
            'n': len(entries),
        }

    if isinstance(value, (set, frozenset)):
        items = list(value)
        return {
            't': 'set',
            'kind': type(value).__name__,
            'items': [cell(v) for v in items[:MAX_CELLS]],
            'n': len(items),
        }

    return None


def size_of(shape):
    """Roughly how many cells a structure costs, for the budget."""
    if shape['t'] in ('seq', 'set'):
        return len(shape['items'])
    if shape['t'] == 'text':
        return len(shape['chars'])
    if shape['t'] == 'map':
        return len(shape['entries'])
    if shape['t'] == 'grid':
        return sum(len(row) for row in shape['rows'])
    if shape['t'] == 'graph':
        return len(shape['nodes']) + len(shape['edges'])
    return 1


def describe(value):
    global cells_used
    kind = type(value).__name__
    try:
        if kind in SKIP_KINDS or isinstance(value, types.ModuleType):
            return None
        text = repr(value)
    except Exception:
        return {'repr': '<unreprable>', 'kind': kind}
    if len(text) > MAX_REPR:
        text = text[:MAX_REPR - 1] + '\\u2026'
    described = {'repr': text, 'kind': kind}

    if cells_used < CELL_BUDGET:
        try:
            shape = structure(value)
        except Exception:
            shape = None
        if shape is not None:
            cells_used += size_of(shape)
            described['value'] = shape
    return described


def visible_locals(frame):
    items = []
    for name, value in frame.f_locals.items():
        if name.startswith('_') or name in SKIP_NAMES:
            continue
        described = describe(value)
        if described is None:
            continue
        items.append({'name': name, **described})
        if len(items) >= MAX_LOCALS:
            break
    return items


def user_stack(frame):
    frames = []
    current = frame
    while current is not None and len(frames) < MAX_STACK:
        if current.f_code.co_filename == FILENAME:
            frames.append({'fn': current.f_code.co_name, 'line': current.f_lineno})
        current = current.f_back
    frames.reverse()
    return frames


def tracer(frame, event, arg):
    global truncated
    if frame.f_code.co_filename != FILENAME:
        return tracer
    if event not in ('line', 'return', 'exception'):
        return tracer
    # The module's own return is an implementation detail, not a step.
    if event == 'return' and frame.f_code.co_name == '<module>':
        return tracer
    if len(steps) >= MAX_STEPS:
        truncated = True
        sys.settrace(None)
        return None

    record = {
        'line': frame.f_lineno,
        'event': event,
        'fn': frame.f_code.co_name,
        'locals': visible_locals(frame),
        'stack': user_stack(frame),
        'stdout': out_buffer.getvalue()[-MAX_STDOUT_PER_STEP:],
    }
    if event == 'exception' and arg:
        record['exception'] = str(arg[1])
    if event == 'return':
        described = describe(arg)
        if described is not None:
            record['returnValue'] = described['repr']
    steps.append(record)
    return tracer


failure = ''
saved_stdout, saved_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = out_buffer, err_buffer
try:
    compiled = compile(source, FILENAME, 'exec')
    namespace = {'__name__': '__main__'}
    sys.settrace(tracer)
    try:
        exec(compiled, namespace, namespace)
    finally:
        sys.settrace(None)
except Exception:
    failure = traceback.format_exc()
finally:
    sys.stdout, sys.stderr = saved_stdout, saved_stderr

stderr_text = err_buffer.getvalue()
if failure:
    stderr_text = (stderr_text + '\\n' + failure) if stderr_text else failure

json.dumps({
    'steps': steps,
    'stdout': out_buffer.getvalue(),
    'stderr': stderr_text.strip(),
    'truncated': truncated,
    'failed': bool(failure),
})
`;
