<?php

declare(strict_types=1);

namespace Fixture;

final class Calculator
{
    public function add(int $left, int $right): int
    {
        return $left + $right;
    }
}
