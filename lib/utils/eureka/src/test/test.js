'use strict';
const http = require('http');
const _ = require('underscore');
const extend = _.extend;

const oauth = require('abacus-oauth');
const request = require('abacus-request');

process.env.SECURED = 'true';

describe('abacus-eureka', () => {

  let eureka;
  const putSpy = spy((url, options, cb) => {
    cb();
  });

  context('when invoking heartbeat', () => {

    beforeEach(() => {
      require.cache[require.resolve('abacus-request')].exports.put = putSpy;
      eureka = require('..');
    });

    it('verify correct request happened', (done) => {
      eureka.heartbeat('http://test.com', 'app', 0, 1, (error, value) => {
        expect(putSpy.callCount).to.equal(1);
        expect(putSpy.args[0][0])
          .to.equal('http://test.com/apps/:app/:instance');
        expect(putSpy.args[0][1]).to.deep.equal({
          app: 'APP',
          instance: 'app-0.1'
        });
        done();
      });
    });
  });

  context('when registers services in a Eureka registry', (done) => {

    const getBearerToken = (authServer, username, password, scope, cb) => {
      if(username === 'abacus')
        cb(undefined, 'Bearer AAA');
      else
        cb({ statusCode: 401 }, undefined);
    };
    const authorize = (token, scope) => {
      expect(scope).to.deep.equal({
        system: ['abacus.system.read']
      });
      expect(token).to.equal('Bearer AAA');
    };
    const oauthmock = extend({}, oauth, {
      getBearerToken: getBearerToken,
      authorize: authorize
    });


    beforeEach(() => {
      require.cache[require.resolve('abacus-oauth')].exports = oauthmock;
      eureka = require('..');
    });

    it('verify registration', (done) => {
      // Create a test Eureka HTTP server
      const server = http.createServer((req, res) => {
        if (req.url === '/ping' && req.method === 'OPTIONS')
          res.end('okay');

        // Handle the Eureka REST operations
        else if (
          req.url === '/eureka/v2/apps/TEST' && req.method === 'POST') {

          // A test Eureka app instance registration
          const instance = {
            instance: {
              app: 'TEST',
              asgName: 'TEST',
              dataCenterInfo: {
                '@class':
                  'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
                name: 'MyOwn'
              },
              hostName: '127.0.0.1',
              ipAddr: '127.0.0.1',
              port: {
                $: 1234,
                '@enabled': true
              },
              metadata: {
                port: 1234
              },
              status: 'UP',
              vipAddress: '127.0.0.1'
            }
          };

          let body = '';
          req.on('data', (chunk) => {
            body = body + chunk;
          });
          req.on('end', () => {
            expect(JSON.parse(body)).to.deep.equal(instance);
            res.statusCode = 200;
            res.end('OK');
          });
        }
        else if (
          req.url === '/eureka/v2/apps/TEST/test-0.0' &&
          req.method === 'DELETE') {
          res.statusCode = 200;
          res.end('OK');
        }
        else if (
          req.url === '/eureka/v2/apps/TEST/test-0.0' &&
          req.method === 'GET') {

          // A test Eureka app instance registration
          const instance = {
            instance: {
              hostName: 'test-0.0',
              app: 'TEST',
              ipAddr: '127.0.0.1',
              vipAddress: '127.0.0.1',
              status: 'UP',
              overriddenstatus: 'UNKNOWN',
              port: {
                '@enabled': 'true',
                '$': '1234'
              },
              securePort: {
                '@enabled': 'false',
                '$': '7002'
              },
              countryId: 1,
              dataCenterInfo: {
                '@class': '',
                name: 'MyOwn'
              },
              leaseInfo: {
                renewalIntervalInSecs: 30,
                durationInSecs: 90,
                registrationTimestamp: 1445827972098,
                lastRenewalTimestamp: 1445827972098,
                evictionTimestamp: 0,
                serviceUpTimestamp: 1445827972098
              },
              metadata: {
                '@class': ''
              },
              isCoordinatingDiscoveryServer: false,
              lastUpdatedTimestamp: 1445827972098,
              lastDirtyTimestamp: 1445827972098,
              actionType: 'ADDED'
            }
          };

          res.setHeader('Content-type', 'application/json');
          res.end(JSON.stringify(instance));
        }
        else
          throw new Error('Invalid request');
      });

      // Listen on an ephemeral port
      server.listen(0);

      // Handle callbacks
      let cbs = 0;
      const cb = () => {
        if (++cbs === 3)
          done();
      };

      const s = eureka(request.route('http://localhost::p', {
        p: server.address().port
      }));

      // Register an instance
      eureka.register(s, 'test', '0', '0', '127.0.0.1', 1234, (err, val) => {
        expect(err).to.equal(undefined);
        cb();
      });

      // Lookup an instance
      eureka.instance(s, 'test', '0', '0', (err, val) => {
        expect(err).to.equal(undefined);

        // The expected instance registration
        const instance = {
          app: 'TEST',
          instance: 'test-0.0',
          address: '127.0.0.1',
          port: 1234
        };
        expect(val).to.deep.equal(instance);

        cb();
      });

      // Deregister an instance
      eureka.deregister(s, 'test', '0', '0', (err, val) => {
        expect(err).to.equal(undefined);
        cb();
      });
    });
  });

});
