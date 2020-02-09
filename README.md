# Pretty Please

[![Test Coverage](https://api.codeclimate.com/v1/badges/bade509a61c126d7f488/test_coverage)](https://codeclimate.com/github/tdreyno/pretty-please/test_coverage)
[![npm latest version](https://img.shields.io/npm/v/@tdreyno/pretty-please/latest.svg)](https://www.npmjs.com/package/@tdreyno/pretty-please)

Pretty Please is a TypeScript library provides Tasks an alternative to Promises.

Documentation of this project is a work in progress. For now, take a look at the example below and lean heavily on TypeScript's information around the public API.

## Installation

### Yarn

```sh
yarn add @tdreyno/pretty-please
```

### NPM

```sh
npm install --save @tdreyno/pretty-please
```

## Examples

```typescript
const getFriendsNames = id =>
  // Load data.
  Task.fromPromise(fetch(`/user/${id}.json`))

    // Parse JSON text into valid Person type.
    .chain(parseUserData)

    // Load all of a user's friends in parallel.
    .chain(user =>
      user.friends
        .map(id => HTTP.get(`/user/${id}.json`).chain(parseUserData))
        .chain(Task.all)
    )

    // Map to an array of friend's names.
    .map(friends => friends.map(f => f.name));

// Prepares the task, but does not run anything.
const task = getFriendsNames(1);

// Run the task.
task.fork(
  e => console.error(e),
  names => console.log("Friend names", names)
);
```

## License

Pretty Please is licensed under the the Hippocratic License. It is an [Ethical Source license](https://ethicalsource.dev) derived from the MIT License, amended to limit the impact of the unethical use of open source software.
