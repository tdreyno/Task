/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any, @typescript-eslint/no-use-before-define */
import { constant, identity, range } from "../util";

export type Reject<E> = (error: E) => void;
export type Resolve<S> = (result: S) => void;
export type Fork<E, S> = (reject: Reject<E>, resolve: Resolve<S>) => void;

/**
 * Create a new task.
 * @param computation A function which will be run when the task starts.
 */
export class Task<E, S> implements PromiseLike<S> {
  public static fail = fail;
  public static succeed = succeed;
  public static empty = empty;
  public static failIn = failIn;
  public static succeedIn = succeedIn;
  public static of = succeed;
  public static all = all;
  public static sequence = sequence;
  public static firstSuccess = firstSuccess;
  public static never = never;
  public static fromPromise = fromPromise;
  public static fromLazyPromise = fromLazyPromise;
  public static race = race;
  public static external = external;
  public static emitter = emitter;
  public static succeedBy = succeedBy;
  public static ap = ap;
  public static map2 = map2;
  public static map3 = map3;
  public static map4 = map4;
  public static loop = loop;
  public static reduce = reduce;
  public static zip = zip;
  public static zipWith = zipWith;
  public static flatten = flatten;

  public fork: Fork<E, S>;

  constructor(computation: Fork<E, S>) {
    this.fork = computation;
  }

  /**
   * Alias to match promise API and let async/await work.
   * Mostly "private". Do not use.
   */
  public then<TResult1 = S, TResult2 = never>(
    onfulfilled?:
      | ((value: S) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.toPromise().then(onfulfilled, onrejected);
  }

  public chain<S2>(fn: (result: S) => Task<E, S2> | Promise<S2>): Task<E, S2> {
    return chain(fn, this);
  }

  public succeedIf(fn: () => S | undefined): Task<E, S> {
    return succeedIf(fn, this);
  }

  public onlyOnce(): Task<E, S> {
    return onlyOnce(this);
  }

  public toPromise(): Promise<S> {
    return toPromise(this);
  }

  public swap<E2 extends E, S2 extends S>(): Task<S2, E2> {
    return swap<E, S, E2, S2>(this);
  }

  public map<S2>(fn: (result: S) => S2): Task<E, S2> {
    return map(fn, this);
  }

  public forward<S2>(value: S2): Task<E, S2> {
    return map(constant(value), this);
  }

  public tap(fn: (result: S) => void): Task<E, S> {
    return tap(fn, this);
  }

  public tapChain<S2>(
    fn: (result: S) => Task<E, S2> | Promise<S2>
  ): Task<E, S> {
    return tapChain(fn, this);
  }

  public mapError<E2>(fn: (error: E) => E2): Task<E2, S> {
    return mapError(fn, this);
  }

  public mapBoth<E2, S2>(
    handleError: (error: E) => E2,
    handleSuccess: (success: S) => S2
  ): Task<E2, S2> {
    return mapBoth(handleError, handleSuccess, this);
  }

  public fold<R>(
    handleError: (error: E) => R,
    handleSuccess: (success: S) => R
  ): Task<unknown, R> {
    return fold(handleError, handleSuccess, this);
  }

  public orElse<S2>(
    fn: (error: E) => Task<E, S | S2> | Promise<S | S2>
  ): Task<E, S | S2> {
    return orElse(fn, this);
  }

  public ap<E2, S2, S3 = S extends (arg: S2) => any ? ReturnType<S> : never>(
    taskOrPromise: Task<E | E2, S2> | Promise<S2>
  ): Task<E | E2, S3> {
    return ap((this as unknown) as Task<E, (result: S2) => S3>, taskOrPromise);
  }

  public wait(ms: number): Task<E, S> {
    return wait(ms, this);
  }

  public retryIn(ms: number): Task<E, S> {
    return retryIn(ms, this);
  }

  public retryWithExponentialBackoff(ms: number, times: number): Task<E, S> {
    return retryWithExponentialBackoff(ms, times, this);
  }

  public flatten<S2>(this: Task<E, Task<E, S2>>): Task<E, S2> {
    return flatten(this);
  }
}

/**
 * A special form of Task which can be resolved/rejected externally.
 */
export class ExternalTask<E, S> extends Task<E, S> {
  private computationReject_?: (error: E) => void;
  private computationResolve_?: (result: S) => void;
  private alreadyError_?: E;
  private alreadyResult_?: S;
  private lastState_: "pending" | "error" | "success" = "pending";

  constructor() {
    super((reject, resolve) => {
      switch (this.lastState_) {
        case "error":
          reject(this.alreadyError_!);

        case "success":
          resolve(this.alreadyResult_!);

        case "pending":
          this.computationReject_ = reject;
          this.computationResolve_ = resolve;
      }
    });
  }

  public reject(error: E): void {
    this.alreadyError_ = error;
    this.lastState_ = "error";

    if (this.computationReject_) {
      this.computationReject_(error);
    }
  }

  public resolve(result: S): void {
    this.alreadyResult_ = result;
    this.lastState_ = "success";

    if (this.computationResolve_) {
      this.computationResolve_(result);
    }
  }
}

/**
 * Creates a Task which can be resolved/rejected externally.
 */
export function external<E, S>(): ExternalTask<E, S> {
  return new ExternalTask();
}

export function emitter<Args extends any[], R>(
  fn: (...args: Args) => R
): [ExternalTask<any, R>, (...args: Args) => void] {
  const task = external<any, R>();

  return [
    task,
    (...args: Args) => {
      try {
        task.resolve(fn(...args));
      } catch (e) {
        task.reject(e);
      }
    }
  ];
}

/**
 * Creates a Task which has already successfully completed with `result`.
 * @alias of
 * @alias ok
 * @param result The value to place into the successful Task.
 */
export function succeed<S, E = any>(result: S): Task<E, S> {
  return new Task((_, resolve) => resolve(result));
}

export const of = succeed;

/**
 * Creates a Task which succeeds when forked.
 * @param result The function which will produce the result.
 */
export function succeedBy<S, E = any>(result: () => S): Task<E, S> {
  return new Task((reject, resolve) => {
    try {
      resolve(result());
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Creates a Task has an empty result.
 * @alias unit
 */
export function empty<E = any>(): Task<E, void> {
  return of(void 0);
}

/**
 * Creates a Task which automatically succeeds at some time in the future with `result`.
 * @param ms How many milliseconds until it succeeds.
 * @param result The value to place into the successful Task.
 */
export function succeedIn<S, E = any>(ms: number, result: S): Task<E, S> {
  return new Task((_, resolve) => setTimeout(() => resolve(result), ms));
}

/**
 * Creates a Task which has already failed with `error`.
 * @alias err
 * @param error The error to place into the failed Task.
 */
export function fail<E, S = any>(error: E): Task<E, S> {
  return new Task(reject => reject(error));
}

/**
 * Creates a Task which automatically fails at some time in the future with `error`.
 *  @param ms How many milliseconds until it succeeds.
 * @param error The error to place into the failed Task.
 */
export function failIn<E, S = any>(ms: number, error: E): Task<E, S> {
  return new Task(reject => setTimeout(() => reject(error), ms));
}

/**
 * Creates a Task will never finish.
 */
export function never(): Task<never, never> {
  return new Task(() => void 0);
}

/**
 * Execute task computation and call handlers on completion.
 * @param reject Function to call on failure.
 * @param resolve Function to call on success.
 * @param task The task to fork.
 */
export function fork<E, S>(
  reject: Reject<E>,
  resolve: Resolve<S>,
  task: Task<E, S>
): void {
  return task.fork(reject, resolve);
}

/**
 * Chain a task to run after a previous task has succeeded.
 * @param fn Takes a successful result and returns a new task.
 * @param task The task which will chain to the next one on success.
 */
export function chain<E, S, S2>(
  fn: (result: S) => Task<E, S2> | Promise<S2>,
  task: Task<E, S>
): Task<E, S2> {
  return new Task((reject, resolve) =>
    task.fork(reject, b => autoPromiseToTask(fn(b)).fork(reject, resolve))
  );
}

/**
 * If a function returns a Promise instead of a Task, automatically
 * convert it to a Task.
 * @param promiseOrTask Either a promise or a task
 */
function autoPromiseToTask<E, S>(promiseOrTask: Task<E, S> | Promise<S>) {
  if (promiseOrTask instanceof Promise) {
    return fromPromise(promiseOrTask);
  }

  return promiseOrTask;
}

/**
 * When forked, run a function which can check whether the task has already succeeded.
 * @param fn The function which either returns a success value or undefined.
 * @param task The task to run if the check fails (returns undefined).
 */
export function succeedIf<E, S>(
  fn: () => S | undefined,
  task: Task<E, S>
): Task<E, S> {
  return new Task((reject, resolve) => {
    const result = fn();

    if (result) {
      resolve(result);
      return;
    }

    task.fork(reject, resolve);
  });
}

/**
 * A task which only runs once. Caches the success or failure. Be careful.
 * @alias share
 * @param task The task to cache results.
 */
export function onlyOnce<E, S>(task: Task<E, S>): Task<E, S> {
  let state: "initialized" | "pending" | "success" | "failure" = "initialized";
  let cachedResult: S;
  let cachedError: E;

  let callbackId = 0;
  const callbacks: {
    [id: string]: { reject: Reject<E>; resolve: Resolve<S> };
  } = {};

  function notify(reject: Reject<E>, resolve: Resolve<S>) {
    const id = callbackId++;

    callbacks[id] = { reject, resolve };
  }

  function triggerReject(error: E) {
    state = "failure";
    cachedError = error;

    Object.keys(callbacks).forEach(id => {
      callbacks[id].reject(error);
      delete callbacks[id];
    });
  }

  function triggerResolve(result: S) {
    state = "success";
    cachedResult = result;

    Object.keys(callbacks).forEach(id => {
      callbacks[id].resolve(result);
      delete callbacks[id];
    });
  }

  return new Task((reject, resolve) => {
    switch (state) {
      case "success":
        resolve(cachedResult!);
        break;

      case "failure":
        reject(cachedError!);
        break;

      case "pending":
        notify(reject, resolve);
        break;

      case "initialized":
        state = "pending";

        notify(reject, resolve);

        task.fork(triggerReject, triggerResolve);
    }
  });
}

export const share = onlyOnce;

/**
 * Given a promise, create a Task which relies on it.
 * @param promise The promise we will gather the success from.
 */
export function fromPromise<S, E = any>(
  maybePromise: S | Promise<S>
): Task<E, S> {
  if (maybePromise instanceof Promise) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return new Task((reject, resolve) => maybePromise.then(resolve, reject));
  }

  return of(maybePromise);
}

/**
 * Take a function which generates a promise and lazily execute it.
 * @param getPromise The getter function
 */
export function fromLazyPromise<S, E = any>(
  getPromise: () => S | Promise<S>
): Task<E, S> {
  return succeedBy(getPromise).chain(fromPromise);
}

/**
 * Given a task, create a Promise which resolves when the task does.
 * @param task The task we will convert to a promise.
 */
export function toPromise<E, S>(task: Task<E, S>): Promise<S> {
  return new Promise((resolve, reject) => task.fork(reject, resolve));
}

/**
 * Given an array of tasks, return the one which finishes first.
 * @alias select
 * @param tasksOrPromises The tasks to run in parallel.
 */
export function race<E, S>(
  tasksOrPromises: Array<Task<E, S> | Promise<S>>
): Task<E, S> {
  return new Task<E, S>((reject, resolve) => {
    let done = false;

    return tasksOrPromises.map(taskOrPromise =>
      autoPromiseToTask(taskOrPromise).fork(
        (error: E) => {
          if (done) {
            return;
          }

          done = true;
          reject(error);
        },
        (result: S) => {
          if (done) {
            return;
          }

          done = true;
          resolve(result);
        }
      )
    );
  });
}

export class LoopBreak<S> {
  constructor(public readonly value: S) {}
}

export class LoopContinue<S> {
  constructor(public readonly value: S) {}
}

/**
 * Given an initialValue, asynchronously loop until either a value is
 * resolved by returning a Task<E, LoopBreak<S>>.
 * @param fn A function that takes the current loop value and decides whether to continue or break.
 * @param initialValue The initial value.
 */
export function loop<E, S, T>(
  fn: (currentValue: T) => Task<E, LoopBreak<S> | LoopContinue<T>>,
  initialValue: T
): Task<E, S> {
  return new Task((reject, resolve) => {
    const tryLoop = (currentValue: T) => {
      fn(currentValue).fork(
        err => {
          reject(err);
        },

        result => {
          if (result instanceof LoopBreak) {
            resolve(result.value);
          }

          if (result instanceof LoopContinue) {
            tryLoop(result.value);
          }
        }
      );
    };

    tryLoop(initialValue);
  });
}

/**
 * An async reducer. Given an initial return value and an array of
 * items to sequentially loop over, pass each step through a reducer
 * function which returns a Task of the next reduced value.
 * @param fn
 * @param initialValue
 * @param items
 */
export function reduce<E, T, V>(
  fn: (acc: V, currentValue: T, index: number, original: T[]) => Task<E, V>,
  initialValue: V,
  items: T[]
): Task<E, V> {
  return loop(
    ({ remainingItems, currentResult }) => {
      if (remainingItems.length === 0) {
        return of(new LoopBreak(currentResult));
      }

      const [head, ...tail] = remainingItems;
      const index = items.length - tail.length - 1;

      return fn(currentResult, head, index, items).map(
        nextResult =>
          new LoopContinue({ remainingItems: tail, currentResult: nextResult })
      );
    },

    { remainingItems: items, currentResult: initialValue }
  );
}

/**
 * Given an array of tasks, return the one which finishes successfully first.
 * @param tasksOrPromises The tasks to run in parallel.
 */
export function firstSuccess<E, S>(
  tasksOrPromises: Array<Task<E, S> | Promise<S>>
): Task<E[], S> {
  if (tasksOrPromises.length === 0) {
    return fail([]);
  }

  return new Task<E[], S>((reject, resolve) => {
    let isDone = false;
    let runningTasks = tasksOrPromises.length;

    const errors: E[] = [];

    return tasksOrPromises.map(taskOrPromise =>
      autoPromiseToTask(taskOrPromise).fork(
        (error: E) => {
          if (isDone) {
            return;
          }

          runningTasks -= 1;

          errors.push(error);

          if (runningTasks === 0) {
            reject(errors);
          }
        },
        (result: S) => {
          if (isDone) {
            return;
          }

          isDone = true;

          resolve(result);
        }
      )
    );
  });
}

/**
 * Given an array of task which return a result, return a new task which results an array of results.
 * @alias collect
 * @param tasksOrPromises The tasks to run in parallel.
 */
export function all<E, S>(
  tasksOrPromises: Array<Task<E, S> | Promise<S>>
): Task<E, S[]> {
  if (tasksOrPromises.length === 0) {
    return of([]);
  }

  return new Task<E, S[]>((reject, resolve) => {
    let isDone = false;
    let runningTasks = tasksOrPromises.length;

    const results: S[] = [];

    return tasksOrPromises.map((taskOrPromise, i) =>
      autoPromiseToTask(taskOrPromise).fork(
        (error: E) => {
          if (isDone) {
            return;
          }

          isDone = true;

          reject(error);
        },
        (result: S) => {
          if (isDone) {
            return;
          }

          runningTasks -= 1;

          results[i] = result;

          if (runningTasks === 0) {
            resolve(results);
          }
        }
      )
    );
  });
}

/**
 * Creates a task that waits for two tasks of different types to
 * resolve as a two-tuple of the results.
 * @param taskAOrPromise The first task.
 * @param taskBOrPromise The second task.
 */
export function zip<E, E2, S, S2>(
  taskAOrPromise: Task<E, S> | Promise<S>,
  taskBOrPromise: Task<E2, S2> | Promise<S2>
): Task<E | E2, [S, S2]> {
  return map2(a => b => [a, b], taskAOrPromise, taskBOrPromise);
}

/**
 * Creates a task that waits for two tasks of different types to
 * resolve, then passing the resulting two-tuple of results through
 * a mapping function.
 * @param fn
 * @param taskAOrPromise The first task.
 * @param taskBOrPromise The second task.
 */
export function zipWith<E, E2, S, S2, V>(
  fn: (resultA: S, resultB: S2) => V,
  taskAOrPromise: Task<E, S> | Promise<S>,
  taskBOrPromise: Task<E2, S2> | Promise<S2>
): Task<E | E2, V> {
  return map2(a => b => fn(a, b), taskAOrPromise, taskBOrPromise);
}

/**
 * Given an array of task which return a result, return a new task which results an array of results.
 * @param tasks The tasks to run in sequence.
 */
export function sequence<E, S>(
  tasksOrPromises: Array<Task<E, S> | Promise<S>>
): Task<E, S[]> {
  if (tasksOrPromises.length === 0) {
    return of([]);
  }

  return tasksOrPromises.reduce((sum, taskOrPromise) => {
    return chain(list => {
      return map(result => [...list, result], autoPromiseToTask(taskOrPromise));
    }, sum);
  }, succeed([] as S[]));
}

/**
 * Given a task, swap the error and success values.
 * @param task The task to swap the results of.
 */
export function swap<E, S, E2 extends E, S2 extends S>(
  task: Task<E, S>
): Task<S2, E2> {
  return new Task<S2, E2>((reject, resolve) =>
    task.fork(
      e => resolve(e as E2),
      s => reject(s as S2)
    )
  );
}

/**
 * Given a task, map the successful value to a Task.
 * @param fn A function which takes the original successful result and returns the new one.
 * @param task The task to map the succcessful result.
 */
export function map<E, S, S2>(
  fn: (result: S) => S2,
  task: Task<E, S>
): Task<E, S2> {
  return new Task<E, S2>((reject, resolve) =>
    task.fork(reject, result => resolve(fn(result)))
  );
}

export function map2<E, E2, S, S2, S3>(
  fn: (a: S) => (b: S2) => S3,
  taskA: Task<E, S> | Promise<S>,
  taskB: Task<E2, S2> | Promise<S2>
): Task<E | E2, S3> {
  return Task.of(fn)
    .ap(taskA)
    .ap(taskB);
}

export function map3<E, E2, E3, S, S2, S3, S4>(
  fn: (a: S) => (b: S2) => (c: S3) => S4,
  taskA: Task<E, S> | Promise<S>,
  taskB: Task<E2, S2> | Promise<S2>,
  taskC: Task<E3, S3> | Promise<S3>
): Task<E | E2 | E3, S4> {
  return Task.of(fn)
    .ap(taskA)
    .ap(taskB)
    .ap(taskC);
}

export function map4<E, E2, E3, E4, S, S2, S3, S4, S5>(
  fn: (a: S) => (b: S2) => (c: S3) => (d: S4) => S5,
  taskA: Task<E, S> | Promise<S>,
  taskB: Task<E2, S2> | Promise<S2>,
  taskC: Task<E3, S3> | Promise<S3>,
  taskD: Task<E4, S4> | Promise<S4>
): Task<E | E2 | E3 | E4, S5> {
  return Task.of(fn)
    .ap(taskA)
    .ap(taskB)
    .ap(taskC)
    .ap(taskD);
}

/**
 * Run a side-effect on success. Useful for logging.
 * @param fn A function will fire with the successful value.
 * @param task The task to tap on succcess.
 */
export function tap<E, S>(
  fn: (result: S) => void,
  task: Task<E, S>
): Task<E, S> {
  return map(result => {
    fn(result);

    return result;
  }, task);
}

/**
 * Run an additional task on success. Useful for async side-effects.
 * @alias defer
 * @param fn A function will fire with the successful value.
 * @param task The task to tap on succcess.
 */
export function tapChain<E, S, S2>(
  fn: (result: S) => Task<E, S2> | Promise<S2>,
  task: Task<E, S>
): Task<E, S> {
  return chain(result => autoPromiseToTask(fn(result)).forward(result), task);
}

/**
 * Given a task, map the failure error to a Task.
 * @alias recoverWith
 * @alias rescue
 * @param fn A function which takes the original failure error and returns the new one.
 * @param task The task to map the failure.
 */
export function mapError<E, S, E2>(
  fn: (error: E) => E2,
  task: Task<E, S>
): Task<E2, S> {
  return new Task<E2, S>((reject, resolve) =>
    task.fork(error => reject(fn(error)), resolve)
  );
}

/**
 * Given a task, map both the failure error and the success result to a Task.
 * @param handleError A function which takes the original failure error and returns the new one.
 * @param handleSuccess A function which takes the original successful result and returns the new one.
 * @param task The task to map the failure and succeess of.
 */
export function mapBoth<E, S, E2, S2>(
  handleError: (error: E) => E2,
  handleSuccess: (success: S) => S2,
  task: Task<E, S>
): Task<E2, S2> {
  return mapError(handleError, map(handleSuccess, task));
}

/**
 * Given a task, map both the failure error and the success result to a Task which always succeeds.
 * @param handleError A function which takes the original failure error and returns a successful result.
 * @param handleSuccess A function which takes the original successful result and returns a new successful result.
 * @param task The task to map failure and succeess to a success for.
 */
export function fold<E, S, R>(
  handleError: (error: E) => R,
  handleSuccess: (success: S) => R,
  task: Task<E, S>
): Task<unknown, R> {
  return new Task<unknown, R>((_, resolve) =>
    task.fork(
      error => resolve(handleError(error)),
      result => resolve(handleSuccess(result))
    )
  );
}

/**
 * Given a task, if the result in a failure, attemp to generate another Task from the error.
 * @param fn A function which takes the original failure error and returns a Task.
 * @param task The task to try to run a recovery function on failure.
 */
export function orElse<E, S>(
  fn: (error: E) => Task<E, S> | Promise<S>,
  task: Task<E, S>
): Task<E, S> {
  return new Task<E, S>((reject, resolve) =>
    task.fork(
      error => autoPromiseToTask(fn(error)).fork(reject, resolve),
      resolve
    )
  );
}

/**
 * Given a task that succeeds with a map function as its result,
 * run that function over the result of a second successful Task.
 * @param appliedTaskOrPromise The task whose value will be passed to the map function.
 * @param task The task who will return a map function as the success result.
 */
export function ap<E, S, S2>(
  taskOrPromise: Task<E, (result: S) => S2> | Promise<(result: S) => S2>,
  appliedTaskOrPromise: Task<E, S> | Promise<S>
): Task<E, S2> {
  return new Task((reject, resolve) => {
    let targetResult: S;
    let applierFunction: ((result: S) => S2) | undefined;
    let hasResultLoaded = false;
    let isRejected = false;

    const handleResolve = <T>(onResolve: (result: T) => void) => {
      return (x: T) => {
        if (isRejected) {
          return;
        }

        onResolve(x);

        if (applierFunction && hasResultLoaded) {
          resolve(applierFunction(targetResult));
        }
      };
    };

    const handleReject = (x: E) => {
      if (isRejected) {
        return;
      }

      isRejected = true;
      reject(x);
    };

    autoPromiseToTask(taskOrPromise).fork(
      handleReject,
      handleResolve((x: (result: S) => S2) => {
        applierFunction = x;
      })
    );

    autoPromiseToTask(appliedTaskOrPromise).fork(
      handleReject,
      handleResolve<S>((x: S) => {
        hasResultLoaded = true;
        targetResult = x;
      })
    );
  });
}

/**
 * Wait some number of seconds to continue after a successful task.
 * @param ms How long to wait in milliseconds.
 * @param task Which task to wait to succeed with.
 */
export function wait<E, S>(ms: number, task: Task<E, S>): Task<E, S> {
  return new Task((reject, resolve) => {
    setTimeout(() => task.fork(reject, resolve), ms);
  });
}

/**
 * If a task fails, retry it in the future.
 * @param ms How long to wait before trying.
 * @param task Which task to retry.
 */
export function retryIn<E, S>(ms: number, task: Task<E, S>): Task<E, S> {
  return task.orElse(() => task.wait(ms));
}

/**
 * If a task fails, retry it X times, with exponential backoff.
 * @param ms How long to wait before trying the first time.
 * @param times How many times to attempt, each waiting 2x the previous time.
 * @param task Which task to retry.
 */
export function retryWithExponentialBackoff<E, S>(
  ms: number,
  times: number,
  task: Task<E, S>
): Task<E, S> {
  return range(times).reduce((sum, i) => sum.retryIn(ms * 2 ** i), task);
}

/**
 * Takes a nested task of tasks, which often comes from a map, and
 * flattens to just the resulting chained task.
 * @param task The task which resolves to an other task.
 */
export function flatten<E, S>(task: Task<E, Task<E, S>>): Task<E, S> {
  return task.chain(identity);
}
