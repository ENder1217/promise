var Promise = (function () {
    function Promise(resolver) {

        // 如果存在Promise对象则返回
        if (typeof window.Promise === 'function') {
            return window.Promise;
        }

        // 如果传入的参数不是函数提示出错
        if (typeof resolver !== 'function') {
            throw new TypeError('Promise resolver ' + resolver + ' is not a function')
        }

        // 避免出现使用var promise = Promise()的情况
        if (!(this instanceof Promise)) return new Promise(resolver)

        var self = this;
        self.callbacks = []; // 回调函数集合
        self.status = 'pending'; // Promise当前状态
        self.data = void 0; // Promise的值

        function resolve(value) {

            // 3.1 In practice, this requirement ensures that onFulfilled and onRejected execute asynchronously
            // 根据规则需要进行异步操作，不然不会出现我们预期的结果
            setTimeout(function () {

                // promise保持着一种状态，确定了状态就不能再改变
                if (self.status !== 'pending') {
                    return;
                }

                self.status = 'resolved';
                self.data = value;

                // 触发resolve函数
                for (var i = 0, l = self.callbacks.length; i < l; i++) {
                    self.callbacks[i].onResolved(value);
                }
            });
        }

        function reject(reason) {
            setTimeout(function () {

                if (self.status !== 'pending') {
                    return;
                }

                self.status = 'rejected';
                self.data = reason;

                // 触发reject函数
                for (var i = 0, l = self.callbacks.length; i < l; i++) {
                    self.callbacks[i].onRejected(reason);
                }
            });
        }

        // 防止出现new Promise(function(resolve, reject){ throw 2 })
        try {
            resolver(resolve, reject)
        } catch (e) {
            reject(e)
        }
    }

    // 我们要把onResolved/onRejected的返回值x，当成一个可能是Promise的对象
    // 即标准里所说的thenable，并以最保险的方式调用x上的then方法
    function resolvePromise(promise2, x, resolve, reject) {
        var thenCalledOrThrow = false,
            then;

        // 2.3.1 if promise and x refer to the same object, reject promise with a TypeError as the reason
        if (promise2 === x) {
            return reject(new TypeError('Chaining cycle detected for promise!'))
        }

        if (x instanceof Promise) { // 2.3.2 if x is a promise

            // if x is pending, promise must remain pending until x is fulfilled or rejected.
            // 如果x的状态还没有确定，那么它是有可能被一个thenable决定最终的状态和值（有可能被一个Promise Object resolved）
            if (x.status === 'pending') {
                x.then(function (value) {
                    resolvePromise(promise2, value, resolve, reject);
                }, reject)
            } else { // 但如果这个Promise的状态已经确定了，那么它肯定有一个确定的值（static value），而不是一个thenable，所以这里直接取它的状态
                x.then(resolve, reject);
            }
            return;
        }

        if ((x !== null) && ((typeof x === 'object') || (typeof x === 'function'))) { // 2.3.3 Otherwise, if x is an object or function
            try {
                then = x.then;

                if (typeof then === 'function') {
                    then.call(x, function rs(y) {

                        if (thenCalledOrThrow) return; // 2.3.3.3 if both resolvePromise and rejectPromise are called
                                                       // or multiple calls to the same argument are made, the first call takes precedence, and any further calls are ignored
                        thenCalledOrThrow = true;
                        return resolvePromise(promise2, y, resolve, reject);
                    }, function rj(r) {

                        if (thenCalledOrThrow) return;

                        thenCalledOrThrow = true;
                        return reject(r);
                    })
                } else {
                    return resolve(x);
                }
            } catch (e) {

                if (thenCalledOrThrow) return;

                thenCalledOrThrow = true;
                return reject(e);
            }
        } else {
            return resolve(x);
        }
    }

    Promise.prototype.then = function (onResolved, onRejected) {

        // 根据标准，如果then的参数不是function，则我们需要忽略它，此处以如下方式处理
        onResolved = typeof onResolved === 'function' ? onResolved : function (v) {return v;}   // Promise值的穿透
        onRejected = typeof onRejected === 'function' ? onRejected : function (r) {throw r;}

        var self = this,
            promise2 = null;

        if (self.status === 'resolved') {

            // 如果promise1(此处即为this/self)的状态已经确定并且是resolved，我们调用onResolved
            // 因为考虑到有可能throw，所以我们将其包在try/catch块里
            return promise2 = new Promise(function (resolve, reject) {
                setTimeout(function () {    // 异步执行
                    try {
                        var x = onResolved(self.data);
                        resolvePromise(promise2, x, resolve, reject);
                    } catch (e) {
                        return reject(e);
                    }
                })
            })
        }

        if (self.status === 'rejected') {

            // 如果promise1(此处即为this/self)的状态已经确定并且是rejected，我们调用onResolved
            // 因为考虑到有可能throw，所以我们将其包在try/catch块里
            return promise2 = new Promise(function (resolve, reject) {
                setTimeout(function () {    // 异步执行
                    try {
                        var x = onRejected(self.data);
                        resolvePromise(promise2, x, resolve, reject);
                    } catch (e) {
                        return reject(e);
                    }
                })
            })
        }

        if (self.status === 'pending') {
            return promise2 = new Promise(function (resolve, reject) {

                // 如果当前的Promise还处于pending状态，我们并不能确定调用onResolved还是onRejected
                // 只能等到Promise的状态确定后，才能确实如何处理
                // 所以我们需要把我们的处理逻辑做为callback放入promise1(此处即this/self)的回调数组里
                self.callbacks.push({
                    onResolved: function (value) {  // 这里没有设置setTimeout是因为在回调数组触发的时候进行了
                        try {
                            var x = onResolved(value);
                            resolvePromise(promise2, x, resolve, reject);
                        } catch (e) {
                            return reject(e);
                        }
                    },
                    onRejected: function (reason) {
                        try {
                            var x = onRejected(reason);
                            resolvePromise(promise2, x, resolve, reject);
                        } catch (e) {
                            return reject(e);
                        }
                    }
                })
            })
        }
    };

    Promise.prototype.catch = function (onRejected) {
        return this.then(null, onRejected)
    };

    Promise.prototype.finally = function (fn) {
        
        // 为什么这里可以呢，因为所有的then调用是一起的，但是这个then里调用fn又异步了一次，所以它总是最后调用的
        return this.then(function (v) {
            setTimeout(fn);
            return v;
        }, function (r) {
            setTimeout(fn);
            throw r;
        })
    };


    // Promise.all() 方法返回一个 Promise, 在可迭代(iterable)参数中所有的 promises 都已经解决了或者当 iterable 参数不包含 promise 时, 返回解决
    // 当传递的 promise 包含一个拒绝(reject)时, 返回拒绝
    Promise.all = function (promises) {
        return new Promise(function (resolve, reject) {
            var resolvedCounter = 0,
                promiseLen = promises.length,
                resolvedValues = new Array(promiseLen);
            
            for (var i = 0; i < promiseLen; i++) {
                (function (i) {
                    Promise.resolve(promises[i]).then(function (value) {
                        resolvedCounter++;
                        resolvedValues[i] = value;
                        if (resolvedCounter === promiseLen) {
                            return resolve(resolvedValues);
                        }
                    }, function (reason) {
                        return reject(reason);
                    });
                })(i)
            }
        })
    };

    // Promise.race(iterable) 方法返回一个 promise ，并伴随着 promise对象解决的返回值或拒绝的错误原因
    // 只要 iterable 中有一个 promise 对象"解决(resolve)"或"拒绝​​​​​​​(reject)"
    Promise.race = function (promises) {
        function resolveRaceCallback(data){
            if(settled){
                return;
            }
            settled = true;
            resolve(promise, data);
        }

        function rejectRaceCallback(reason){
            if(settled){
                return;
            }
            settled = true;
            reject(promise, reason);
        }

        return new Promise(function (resolve, reject) {
            for (var i = 0, l = promises.length; i < l; i++) {
                Promise.resolve(promises[i]).then(resolveRaceCallback, rejectRaceCallback)
            }
        });
    };

    Promise.resolve = function (value) {
        var promise = new Promise(function (resolve, reject) {
            resolvePromise(promise, value, resolve, reject);
        })
        return promise;
    };

    Promise.reject = function (reason) {
        return new Promise(function (resolve, reject) {
            reject(reason);
        })
    };

    Promise.deferred = Promise.defer = function () {
        var dfd = {};
        dfd.promise = new Promise(function (resolve, reject) {
            dfd.resolve = resolve;
            dfd.reject = reject;
        })
        return dfd;
    }

    return Promise;
})()