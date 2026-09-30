/**
 * The test harness, as real Python.
 *
 * Runs the author's cases against the submitted code: import the module, find
 * the entry point, call it with each case's arguments, compare the result to
 * what was expected.
 *
 * Two comparison details matter in practice:
 *
 *  - JSON has arrays where Python has both lists and tuples. A function that
 *    correctly returns `[("ana", 0)]` would otherwise fail against an expected
 *    value of `[["ana", 0]]`, so both are normalised to lists before comparing.
 *  - Floats are compared with a tolerance, because `0.1 + 0.2 != 0.3` is not a
 *    bug in anybody's solution.
 */
export const TEST_SCRIPT = `
import io, json, sys, traceback

source = _ddc_source
entry_point = _ddc_entry
cases = json.loads(_ddc_cases)

MAX_REPR = 400
MAX_STDOUT = 2000
FLOAT_TOLERANCE = 1e-9

results = []
setup_error = ''

namespace = {'__name__': '__ddc_tests__'}
try:
    compile(source, 'main.py', 'exec')
except SyntaxError:
    setup_error = traceback.format_exc(limit=0).strip()

if not setup_error:
    # The module runs once, with its output swallowed: a solution that prints
    # from the top level should not bury the results.
    saved_stdout, saved_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = io.StringIO(), io.StringIO()
    try:
        exec(compile(source, 'main.py', 'exec'), namespace, namespace)
    except Exception:
        setup_error = traceback.format_exc()
    finally:
        sys.stdout, sys.stderr = saved_stdout, saved_stderr

target = namespace.get(entry_point) if not setup_error else None
if not setup_error and target is None:
    setup_error = 'No function named ' + repr(entry_point) + ' was defined.'
elif not setup_error and not callable(target):
    setup_error = repr(entry_point) + ' is not a function.'


def normalise(value):
    """Collapse the differences JSON cannot express."""
    if isinstance(value, tuple):
        return [normalise(item) for item in value]
    if isinstance(value, list):
        return [normalise(item) for item in value]
    if isinstance(value, set):
        # A set has no order, so compare it as a sorted list and hope the
        # author expected the same. Sorting can fail on mixed types.
        try:
            return sorted(normalise(item) for item in value)
        except TypeError:
            return [normalise(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalise(item) for key, item in value.items()}
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        # An integral float and an int are the same answer.
        return int(value) if value.is_integer() else value
    return value


def matches(actual, expected):
    actual, expected = normalise(actual), normalise(expected)
    return equal(actual, expected)


def equal(a, b):
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    if isinstance(a, float) or isinstance(b, float):
        try:
            return abs(float(a) - float(b)) <= FLOAT_TOLERANCE
        except (TypeError, ValueError):
            return False
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
    return a == b


def show(value):
    try:
        text = repr(value)
    except Exception:
        text = '<unreprable>'
    if len(text) > MAX_REPR:
        text = text[:MAX_REPR - 1] + '\\u2026'
    return text


for index, case in enumerate(cases):
    record = {'index': index, 'passed': False, 'actual': '', 'stdout': '', 'error': ''}
    if setup_error:
        record['error'] = setup_error
        results.append(record)
        continue

    buffer = io.StringIO()
    saved_stdout, saved_stderr = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = buffer, buffer
    try:
        returned = target(*case['args'])
        record['actual'] = show(returned)
        record['passed'] = matches(returned, case['expected'])
    except Exception as exc:
        record['error'] = type(exc).__name__ + ': ' + str(exc)
    finally:
        sys.stdout, sys.stderr = saved_stdout, saved_stderr
        record['stdout'] = buffer.getvalue()[:MAX_STDOUT]
    results.append(record)

json.dumps({'results': results, 'setupError': setup_error})
`;
