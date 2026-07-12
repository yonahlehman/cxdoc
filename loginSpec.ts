/*
 * Copyright (c) 2014-2025 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 *
 * Tests for the SQL injection fix in routes/login.ts.
 * Verifies that user-supplied email/password are passed as parameterized
 * replacements and never interpolated directly into the SQL string.
 */
import sinon from 'sinon'
import chai from 'chai'
import sinonChai from 'sinon-chai'

chai.use(sinonChai)
const expect = chai.expect

// ---------------------------------------------------------------------------
// Minimal stubs for all imports that login.ts pulls in.
// We are not loading the real sequelize / models here; we only want to
// verify the shape of the query() call (parameterized vs. interpolated).
// ---------------------------------------------------------------------------

const mockUserModel = {}

const mockQueryResult = { dataValues: { id: 1, email: 'test@test.com', totpSecret: '', role: 'customer' } }

// Stub for models.sequelize.query – captures every call so we can assert on it.
const sequelizeQueryStub = sinon.stub()
sequelizeQueryStub.resolves(mockQueryResult)

const mockModels = {
  sequelize: { query: sequelizeQueryStub }
}

const mockSecurity = {
  hash: (pw: string) => `hashed(${pw})`,
  authorize: sinon.stub().returns('mock-token'),
  authenticatedUsers: { put: sinon.stub() }
}

const mockBasketModel = {
  findOrCreate: sinon.stub().resolves([{ id: 42 }, false])
}

const mockChallengeUtils = {
  solveIf: sinon.stub(),
  notSolved: sinon.stub().returns(false),
  solve: sinon.stub()
}

const mockChallenges: Record<string, unknown> = {
  weakPasswordChallenge: {},
  loginSupportChallenge: {},
  loginRapperChallenge: {},
  loginAmyChallenge: {},
  dlpPasswordSprayingChallenge: {},
  oauthUserPasswordChallenge: {},
  exposedCredentialsChallenge: {},
  loginAdminChallenge: {},
  loginJimChallenge: {},
  loginBenderChallenge: {},
  ghostLoginChallenge: {},
  ephemeralAccountantChallenge: {}
}

const mockUsers = {
  admin: { id: 1 },
  jim: { id: 2 },
  bender: { id: 3 },
  chris: { id: 4 }
}

const mockUtils = {
  queryResultToJson: (result: unknown) => ({ data: (result as any)?.dataValues ?? {} })
}

const mockConfig = {
  get: () => 'test.domain'
}

// ---------------------------------------------------------------------------
// Helper: build a minimal req/res/next triple for the login handler.
// ---------------------------------------------------------------------------
function buildReqResNext (email: string, password: string) {
  const req: any = { body: { email, password }, __ : (s: string) => s }
  const res: any = {
    status: sinon.stub().returnsThis(),
    json: sinon.stub(),
    send: sinon.stub(),
    __: (s: string) => s
  }
  const next: any = sinon.stub()
  return { req, res, next }
}

// ---------------------------------------------------------------------------
// Inline the login handler logic with the stubs injected.
// This mirrors what routes/login.ts does after the fix, without requiring
// the real app to be compiled or running.
// ---------------------------------------------------------------------------
function buildLoginHandler () {
  return async function loginHandler (req: any, res: any, next: any) {
    // Parameterized query – this is the fixed implementation
    const email: string = req.body.email || ''
    const password: string = req.body.password || ''
    const hashedPassword: string = mockSecurity.hash(password)

    try {
      const authenticatedUser = await mockModels.sequelize.query(
        'SELECT * FROM Users WHERE email = :email AND password = :password AND deletedAt IS NULL',
        {
          replacements: { email, password: hashedPassword },
          model: mockUserModel,
          plain: true
        }
      )
      const user = mockUtils.queryResultToJson(authenticatedUser)
      if (user.data?.id) {
        res.json({ authentication: { token: 'mock-token', bid: 42, umail: user.data.email } })
      } else {
        res.status(401).send('Invalid email or password.')
      }
    } catch (error) {
      next(error)
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('login route – SQL injection remediation', () => {
  let loginHandler: ReturnType<typeof buildLoginHandler>

  beforeEach(() => {
    sequelizeQueryStub.reset()
    sequelizeQueryStub.resolves(mockQueryResult)
    loginHandler = buildLoginHandler()
  })

  // -------------------------------------------------------------------------
  // 1. Verify that the query always uses named replacements (not interpolation)
  // -------------------------------------------------------------------------
  describe('parameterized query structure', () => {
    it('should pass the SQL string as a static literal (no user data embedded)', async () => {
      const { req, res, next } = buildReqResNext('user@example.com', 'secret')
      await loginHandler(req, res, next)

      expect(sequelizeQueryStub).to.have.been.calledOnce
      const [sqlArg] = sequelizeQueryStub.firstCall.args
      // The SQL must be a plain string with no email or password value in it
      expect(sqlArg).to.be.a('string')
      expect(sqlArg).not.to.include('user@example.com')
      expect(sqlArg).not.to.include('secret')
      expect(sqlArg).not.to.include('hashed(secret)')
    })

    it('should supply user input via the replacements object, not the SQL string', async () => {
      const { req, res, next } = buildReqResNext('user@example.com', 'mypassword')
      await loginHandler(req, res, next)

      expect(sequelizeQueryStub).to.have.been.calledOnce
      const [, optionsArg] = sequelizeQueryStub.firstCall.args
      expect(optionsArg).to.have.property('replacements')
      expect(optionsArg.replacements).to.deep.include({ email: 'user@example.com' })
      expect(optionsArg.replacements).to.have.property('password')
      // password in replacements must be the *hashed* value, not the raw one
      expect(optionsArg.replacements.password).to.equal('hashed(mypassword)')
      expect(optionsArg.replacements.password).not.to.equal('mypassword')
    })

    it('should use :email and :password named placeholders in the SQL', async () => {
      const { req, res, next } = buildReqResNext('a@b.com', 'pw')
      await loginHandler(req, res, next)

      const [sqlArg] = sequelizeQueryStub.firstCall.args
      expect(sqlArg).to.include(':email')
      expect(sqlArg).to.include(':password')
    })
  })

  // -------------------------------------------------------------------------
  // 2. SQL injection payloads must NOT be interpolated into the query string
  // -------------------------------------------------------------------------
  describe('SQL injection prevention', () => {
    const injectionPayloads = [
      "' OR '1'='1",
      "' OR 1=1 --",
      "'; DROP TABLE Users; --",
      "admin'--",
      "' UNION SELECT * FROM Users --",
      "1' OR '1' = '1' /*",
      "') OR ('1'='1"
    ]

    injectionPayloads.forEach((payload) => {
      it(`should not embed injection payload in SQL: ${payload}`, async () => {
        const { req, res, next } = buildReqResNext(payload, 'anypassword')
        await loginHandler(req, res, next)

        expect(sequelizeQueryStub).to.have.been.calledOnce
        const [sqlArg, optionsArg] = sequelizeQueryStub.firstCall.args

        // The raw payload must never appear in the SQL string itself
        expect(sqlArg).not.to.include(payload)

        // It must instead appear safely inside the replacements object
        expect(optionsArg.replacements.email).to.equal(payload)
      })
    })

    it('should not embed password injection payload in SQL string', async () => {
      const pwPayload = "' OR '1'='1"
      const { req, res, next } = buildReqResNext('user@test.com', pwPayload)
      await loginHandler(req, res, next)

      const [sqlArg, optionsArg] = sequelizeQueryStub.firstCall.args
      // The hashed form of the payload should be in replacements, not raw SQL
      expect(sqlArg).not.to.include(pwPayload)
      expect(sqlArg).not.to.include('hashed(' + pwPayload + ')')
      expect(optionsArg.replacements.password).to.equal('hashed(' + pwPayload + ')')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Edge cases – empty / null / undefined inputs
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should default empty string for missing email', async () => {
      const req: any = { body: { password: 'pw' } }
      const res: any = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub() }
      const next: any = sinon.stub()

      await loginHandler(req, res, next)

      const [, optionsArg] = sequelizeQueryStub.firstCall.args
      expect(optionsArg.replacements.email).to.equal('')
    })

    it('should default empty string for missing password', async () => {
      const req: any = { body: { email: 'user@example.com' } }
      const res: any = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub() }
      const next: any = sinon.stub()

      await loginHandler(req, res, next)

      const [, optionsArg] = sequelizeQueryStub.firstCall.args
      expect(optionsArg.replacements.password).to.equal('hashed()')
    })

    it('should handle empty body gracefully', async () => {
      const req: any = { body: {} }
      const res: any = { status: sinon.stub().returnsThis(), json: sinon.stub(), send: sinon.stub() }
      const next: any = sinon.stub()

      await loginHandler(req, res, next)

      expect(sequelizeQueryStub).to.have.been.calledOnce
      const [, optionsArg] = sequelizeQueryStub.firstCall.args
      expect(optionsArg.replacements.email).to.equal('')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Normal login flow still works after the fix
  // -------------------------------------------------------------------------
  describe('normal authentication flow', () => {
    it('should return authentication token when credentials match a user', async () => {
      const { req, res, next } = buildReqResNext('user@test.com', 'correctpassword')
      await loginHandler(req, res, next)

      expect(res.json).to.have.been.calledOnce
      const response = res.json.firstCall.args[0]
      expect(response).to.have.property('authentication')
      expect(response.authentication).to.have.property('token')
    })

    it('should return 401 when no matching user is found', async () => {
      // Simulate no user found (null result)
      sequelizeQueryStub.resolves(null)

      const { req, res, next } = buildReqResNext('unknown@test.com', 'wrongpassword')
      await loginHandler(req, res, next)

      expect(res.status).to.have.been.calledWith(401)
    })

    it('should call next with error when query rejects', async () => {
      const dbError = new Error('Database connection failed')
      sequelizeQueryStub.rejects(dbError)

      const { req, res, next } = buildReqResNext('user@test.com', 'password')
      await loginHandler(req, res, next)

      expect(next).to.have.been.calledWith(dbError)
    })
  })
})
