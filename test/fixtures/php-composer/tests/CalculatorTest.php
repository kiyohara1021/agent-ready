<?php

declare(strict_types=1);

namespace Fixture\Tests;

use Fixture\Calculator;
use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    public function testAdd(): void
    {
        self::assertSame(3, (new Calculator())->add(1, 2));
    }
}
